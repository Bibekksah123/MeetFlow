import { and, asc, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";

import {
  actionItems,
  decisions,
  meetingSummaries,
  meetings,
  recordings,
  transcripts,
  withWorkerDatabase,
} from "@meetflow/db";

import type { MeetingAnalysis } from "./analysis";

export type TranscriptionJob = {
  transcriptId: string;
  meetingId: string;
  recordingId: string;
  objectKey: string;
};

export async function claimNextTranscription(): Promise<TranscriptionJob | null> {
  return withWorkerDatabase(async (transaction) => {
    const staleBefore = new Date(Date.now() - 30 * 60 * 1000);
    await transaction
      .update(transcripts)
      .set({
        status: sql`CASE WHEN ${transcripts.attemptCount} < 3 THEN 'pending'::public.transcript_status ELSE 'failed'::public.transcript_status END`,
        errorMessage: sql`CASE WHEN ${transcripts.attemptCount} < 3 THEN NULL ELSE 'Transcription stopped after three attempts.' END`,
        startedAt: null,
      })
      .where(and(eq(transcripts.status, "processing"), lt(transcripts.startedAt, staleBefore)));

    const [candidate] = await transaction
      .select({
        transcriptId: transcripts.id,
        meetingId: transcripts.meetingId,
        recordingId: recordings.id,
        objectKey: recordings.objectKey,
        attemptCount: transcripts.attemptCount,
      })
      .from(transcripts)
      .innerJoin(recordings, eq(transcripts.recordingId, recordings.id))
      .where(
        and(
          eq(transcripts.status, "pending"),
          eq(recordings.status, "completed"),
          isNotNull(recordings.objectKey),
          lt(transcripts.attemptCount, 3),
        ),
      )
      .orderBy(asc(transcripts.createdAt))
      .limit(1)
      .for("update", { of: transcripts, skipLocked: true });

    if (!candidate?.recordingId || !candidate.objectKey) return null;

    const [claimed] = await transaction
      .update(transcripts)
      .set({
        status: "processing",
        attemptCount: sql`${transcripts.attemptCount} + 1`,
        startedAt: new Date(),
        completedAt: null,
        errorMessage: null,
      })
      .where(and(eq(transcripts.id, candidate.transcriptId), eq(transcripts.status, "pending")))
      .returning({ id: transcripts.id });

    if (!claimed) return null;
    return {
      transcriptId: candidate.transcriptId,
      meetingId: candidate.meetingId,
      recordingId: candidate.recordingId,
      objectKey: candidate.objectKey,
    };
  });
}

export async function completeTranscription(
  job: TranscriptionJob,
  result: { content: string; segments: [] },
) {
  await withWorkerDatabase(async (transaction) => {
    const [completed] = await transaction
      .update(transcripts)
      .set({
        content: result.content,
        segments: result.segments,
        status: "completed",
        errorMessage: null,
        completedAt: new Date(),
      })
      .where(
        and(
          eq(transcripts.id, job.transcriptId),
          eq(transcripts.recordingId, job.recordingId),
          eq(transcripts.status, "processing"),
        ),
      )
      .returning({ meetingId: transcripts.meetingId });

    if (!completed) return;

    await transaction
      .insert(meetingSummaries)
      .values({ meetingId: completed.meetingId, status: "pending" })
      .onConflictDoUpdate({
        target: meetingSummaries.meetingId,
        set: {
          summary: null,
          keyPoints: [],
          openQuestions: [],
          risks: [],
          followUp: [],
          status: "pending",
          errorMessage: null,
          generatedAt: null,
          attemptCount: 0,
          updatedAt: new Date(),
        },
      });

    await transaction.delete(decisions).where(eq(decisions.meetingId, completed.meetingId));
    await transaction
      .delete(actionItems)
      .where(
        and(eq(actionItems.meetingId, completed.meetingId), eq(actionItems.status, "proposed")),
      );
  });
}

export async function failTranscription(job: TranscriptionJob, errorMessage: string) {
  await withWorkerDatabase(async (transaction) => {
    await transaction
      .update(transcripts)
      .set({
        status: "failed",
        errorMessage,
        completedAt: new Date(),
      })
      .where(
        and(
          eq(transcripts.id, job.transcriptId),
          eq(transcripts.recordingId, job.recordingId),
          eq(transcripts.status, "processing"),
        ),
      );
  });
}

export type MeetingAnalysisJob = {
  summaryId: string;
  meetingId: string;
  meetingTitle: string;
  meetingDate: Date | null;
  transcript: string;
};

export async function claimNextMeetingAnalysis(): Promise<MeetingAnalysisJob | null> {
  return withWorkerDatabase(async (transaction) => {
    const staleBefore = new Date(Date.now() - 30 * 60 * 1000);
    await transaction
      .update(meetingSummaries)
      .set({ status: "pending", errorMessage: null, updatedAt: new Date() })
      .where(
        and(
          eq(meetingSummaries.status, "processing"),
          lt(meetingSummaries.updatedAt, staleBefore),
          lt(meetingSummaries.attemptCount, 3),
        ),
      );
    await transaction
      .update(meetingSummaries)
      .set({
        status: "failed",
        errorMessage: "Analysis stopped after three attempts.",
        updatedAt: new Date(),
      })
      .where(
        and(eq(meetingSummaries.status, "processing"), lt(meetingSummaries.updatedAt, staleBefore)),
      );

    // Backfill completed transcripts created before analysis was deployed.
    const missing = await transaction
      .select({ meetingId: transcripts.meetingId })
      .from(transcripts)
      .leftJoin(meetingSummaries, eq(meetingSummaries.meetingId, transcripts.meetingId))
      .where(
        and(
          eq(transcripts.status, "completed"),
          isNotNull(transcripts.content),
          isNull(meetingSummaries.id),
        ),
      )
      .limit(25);
    if (missing.length > 0) {
      await transaction
        .insert(meetingSummaries)
        .values(missing.map(({ meetingId }) => ({ meetingId, status: "pending" as const })))
        .onConflictDoNothing({ target: meetingSummaries.meetingId });
    }

    const [candidate] = await transaction
      .select({
        summaryId: meetingSummaries.id,
        meetingId: meetings.id,
        meetingTitle: meetings.title,
        meetingDate: meetings.endedAt,
        fallbackDate: meetings.createdAt,
        transcript: transcripts.content,
      })
      .from(meetingSummaries)
      .innerJoin(transcripts, eq(transcripts.meetingId, meetingSummaries.meetingId))
      .innerJoin(meetings, eq(meetings.id, meetingSummaries.meetingId))
      .where(
        and(
          eq(meetingSummaries.status, "pending"),
          lt(meetingSummaries.attemptCount, 3),
          eq(transcripts.status, "completed"),
          isNotNull(transcripts.content),
        ),
      )
      .orderBy(asc(meetingSummaries.createdAt))
      .limit(1)
      .for("update", { of: meetingSummaries, skipLocked: true });

    if (!candidate?.transcript) return null;

    const [claimed] = await transaction
      .update(meetingSummaries)
      .set({
        status: "processing",
        attemptCount: sql`${meetingSummaries.attemptCount} + 1`,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(meetingSummaries.id, candidate.summaryId), eq(meetingSummaries.status, "pending")),
      )
      .returning({ id: meetingSummaries.id });

    if (!claimed) return null;
    return {
      summaryId: candidate.summaryId,
      meetingId: candidate.meetingId,
      meetingTitle: candidate.meetingTitle,
      meetingDate: candidate.meetingDate ?? candidate.fallbackDate,
      transcript: candidate.transcript,
    };
  });
}

export async function completeMeetingAnalysis(job: MeetingAnalysisJob, result: MeetingAnalysis) {
  await withWorkerDatabase(async (transaction) => {
    const [completed] = await transaction
      .update(meetingSummaries)
      .set({
        summary: result.summary,
        keyPoints: result.keyPoints,
        openQuestions: result.openQuestions,
        risks: result.risks,
        followUp: result.followUp,
        status: "completed",
        errorMessage: null,
        generatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(meetingSummaries.id, job.summaryId),
          eq(meetingSummaries.meetingId, job.meetingId),
          eq(meetingSummaries.status, "processing"),
        ),
      )
      .returning({ id: meetingSummaries.id });

    if (!completed) return;

    if (result.decisions.length > 0) {
      await transaction.insert(decisions).values(
        result.decisions.map((decision) => ({
          meetingId: job.meetingId,
          title: decision.title,
          details: decision.details,
          sourceContext: decision.sourceContext,
        })),
      );
    }

    if (result.actionItems.length > 0) {
      await transaction.insert(actionItems).values(
        result.actionItems.map((item) => ({
          meetingId: job.meetingId,
          title: item.title,
          description: item.description,
          assigneeName: item.assignee,
          deadline: item.deadline ? new Date(item.deadline) : null,
          priority: item.priority,
          status: "proposed" as const,
          sourceContext: item.sourceContext,
          confidence: item.confidence.toFixed(2),
        })),
      );
    }
  });
}

export async function failMeetingAnalysis(job: MeetingAnalysisJob, errorMessage: string) {
  await withWorkerDatabase(async (transaction) => {
    await transaction
      .update(meetingSummaries)
      .set({ status: "failed", errorMessage, updatedAt: new Date() })
      .where(
        and(
          eq(meetingSummaries.id, job.summaryId),
          eq(meetingSummaries.meetingId, job.meetingId),
          eq(meetingSummaries.status, "processing"),
        ),
      );
  });
}
