import "server-only";

import { eq } from "drizzle-orm";

import { transcripts, withUserDatabase, type TranscriptSegment } from "@meetflow/db";

export type MeetingTranscript = {
  recordingId: string | null;
  attemptCount: number;
  content: string | null;
  segments: TranscriptSegment[];
  status: "pending" | "processing" | "completed" | "failed";
  errorMessage: string | null;
  completedAt: Date | null;
};

export async function getMeetingTranscript(
  userId: string,
  meetingId: string,
  email?: string | null,
): Promise<MeetingTranscript | null> {
  return withUserDatabase(
    userId,
    async (transaction) => {
      const [transcript] = await transaction
        .select({
          recordingId: transcripts.recordingId,
          attemptCount: transcripts.attemptCount,
          content: transcripts.content,
          segments: transcripts.segments,
          status: transcripts.status,
          errorMessage: transcripts.errorMessage,
          completedAt: transcripts.completedAt,
        })
        .from(transcripts)
        .where(eq(transcripts.meetingId, meetingId))
        .limit(1);

      return transcript ?? null;
    },
    { email },
  );
}
