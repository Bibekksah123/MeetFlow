import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";

import {
  automationRuns,
  meetingParticipants,
  meetingSummaries,
  meetings,
  recordings,
  transcripts,
  actionItems,
  withUserDatabase,
} from "@meetflow/db";
import { DEVELOPMENT_SAMPLE_CONTEXT } from "@/lib/development-samples";

export type MeetingHistoryRecord = {
  id: string;
  title: string;
  description: string | null;
  status: "scheduled" | "active" | "completed";
  createdAt: Date;
  scheduledAt: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
  participantCount: number | null;
  recordingStatus: "pending" | "recording" | "processing" | "completed" | "failed" | null;
  recordingDurationSeconds: number | null;
  transcriptStatus: "pending" | "processing" | "completed" | "failed" | null;
  analysisStatus: "pending" | "processing" | "completed" | "failed" | null;
  summaryAvailable: boolean;
};

export async function listMeetings(
  userId: string,
  limit = 50,
  email?: string | null,
): Promise<MeetingHistoryRecord[]> {
  return withUserDatabase(
    userId,
    async (transaction) => {
      const rows = await transaction
        .select({
          id: meetings.id,
          ownerId: meetings.ownerId,
          title: meetings.title,
          description: meetings.description,
          status: meetings.status,
          createdAt: meetings.createdAt,
          scheduledAt: meetings.scheduledAt,
          startedAt: meetings.startedAt,
          endedAt: meetings.endedAt,
        })
        .from(meetings)
        .orderBy(desc(meetings.createdAt))
        .limit(limit);

      if (rows.length === 0) return [];
      const meetingIds = rows.map((row) => row.id);

      const [participantCounts, recordingRows, transcriptRows, summaryRows] = await Promise.all([
        transaction
          .select({ meetingId: meetingParticipants.meetingId, count: count() })
          .from(meetingParticipants)
          .where(inArray(meetingParticipants.meetingId, meetingIds))
          .groupBy(meetingParticipants.meetingId),
        transaction
          .select({
            meetingId: recordings.meetingId,
            status: recordings.status,
            durationSeconds: recordings.durationSeconds,
            createdAt: recordings.createdAt,
          })
          .from(recordings)
          .where(inArray(recordings.meetingId, meetingIds))
          .orderBy(desc(recordings.createdAt)),
        transaction
          .select({ meetingId: transcripts.meetingId, status: transcripts.status })
          .from(transcripts)
          .where(inArray(transcripts.meetingId, meetingIds)),
        transaction
          .select({
            meetingId: meetingSummaries.meetingId,
            status: meetingSummaries.status,
            summary: meetingSummaries.summary,
          })
          .from(meetingSummaries)
          .where(inArray(meetingSummaries.meetingId, meetingIds)),
      ]);

      const visibleParticipantCounts = new Map(
        participantCounts.map((row) => [row.meetingId, row.count]),
      );
      const latestRecordings = new Map<
        (typeof rows)[number]["id"],
        (typeof recordingRows)[number]
      >();
      for (const recording of recordingRows) {
        if (!latestRecordings.has(recording.meetingId)) {
          latestRecordings.set(recording.meetingId, recording);
        }
      }
      const transcriptByMeeting = new Map(transcriptRows.map((row) => [row.meetingId, row]));
      const summaryByMeeting = new Map(summaryRows.map((row) => [row.meetingId, row]));

      return rows.map((meeting) => {
        const recording = latestRecordings.get(meeting.id);
        const transcript = transcriptByMeeting.get(meeting.id);
        const analysis = summaryByMeeting.get(meeting.id);
        return {
          id: meeting.id,
          title: meeting.title,
          description: meeting.description,
          status: meeting.status,
          createdAt: meeting.createdAt,
          scheduledAt: meeting.scheduledAt,
          startedAt: meeting.startedAt,
          endedAt: meeting.endedAt,
          participantCount:
            meeting.ownerId === userId ? (visibleParticipantCounts.get(meeting.id) ?? 0) : null,
          recordingStatus: recording?.status ?? null,
          recordingDurationSeconds: recording?.durationSeconds ?? null,
          transcriptStatus: transcript?.status ?? null,
          analysisStatus: analysis?.status ?? null,
          summaryAvailable: analysis?.status === "completed" && Boolean(analysis.summary?.trim()),
        };
      });
    },
    { email },
  );
}

export function getMeetingDetails(userId: string, meetingId: string, email?: string | null) {
  return withUserDatabase(
    userId,
    async (transaction) => {
      const [meeting] = await transaction
        .select({
          id: meetings.id,
          ownerId: meetings.ownerId,
          title: meetings.title,
          description: meetings.description,
          status: meetings.status,
          createdAt: meetings.createdAt,
          scheduledAt: meetings.scheduledAt,
          startedAt: meetings.startedAt,
          endedAt: meetings.endedAt,
        })
        .from(meetings)
        .where(eq(meetings.id, meetingId))
        .limit(1);

      if (!meeting) return null;

      const participants = await transaction
        .select({
          id: meetingParticipants.id,
          userId: meetingParticipants.userId,
          email: meetingParticipants.inviteeEmail,
          status: meetingParticipants.status,
        })
        .from(meetingParticipants)
        .where(eq(meetingParticipants.meetingId, meetingId))
        .orderBy(asc(meetingParticipants.createdAt));

      return { meeting, participants };
    },
    { email },
  );
}

export async function listMeetingAutomationHistory(
  userId: string,
  meetingId: string,
  email?: string | null,
) {
  return withUserDatabase(
    userId,
    async (transaction) => {
      const rows = await transaction
        .select({
          id: automationRuns.id,
          actionItemTitle: actionItems.title,
          requestedBy: automationRuns.requestedBy,
          action: automationRuns.action,
          destination: automationRuns.destination,
          status: automationRuns.status,
          resultSummary: automationRuns.resultSummary,
          httpStatus: automationRuns.httpStatus,
          errorCode: automationRuns.errorCode,
          createdAt: automationRuns.createdAt,
          completedAt: automationRuns.completedAt,
        })
        .from(automationRuns)
        .innerJoin(actionItems, eq(automationRuns.actionItemId, actionItems.id))
        .innerJoin(meetings, eq(automationRuns.meetingId, meetings.id))
        .where(
          and(
            eq(meetings.id, meetingId),
            eq(meetings.ownerId, userId),
            process.env.NODE_ENV === "production"
              ? sql`${actionItems.sourceContext} IS DISTINCT FROM ${DEVELOPMENT_SAMPLE_CONTEXT}`
              : undefined,
          ),
        )
        .orderBy(desc(automationRuns.createdAt))
        .limit(50);

      return rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        completedAt: row.completedAt?.toISOString() ?? null,
      }));
    },
    { email },
  );
}
