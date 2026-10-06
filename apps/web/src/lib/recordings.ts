import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { EgressStatus, type EgressInfo } from "livekit-server-sdk";

import { meetings, recordings, withUserDatabase } from "@meetflow/db";

import {
  getRoomRecordingEgress,
  isRecordingEgressReady,
  recordingObjectKey,
  stopRoomRecording,
  summarizeEgress,
  type RecordingState,
} from "@/lib/livekit/recordings";
import { recordingObjectExists } from "@/lib/livekit/recording-storage";
import { mergeRecordingStorageResult as mergeStorageCheck } from "@/lib/recording-status";

const activeStates: RecordingState[] = ["pending", "recording", "processing"];

export type MeetingRecording = {
  id: string;
  meetingId: string;
  status: RecordingState;
  objectKey: string | null;
  egressId: string | null;
  durationSeconds: number | null;
  errorCode: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
};

export function mergeRecordingStorageResult(
  summary: ReturnType<typeof summarizeEgress>,
  options: {
    objectExists: boolean;
    canRetry: boolean;
    egressDurationSeconds: number | null;
  },
): ReturnType<typeof summarizeEgress> {
  return mergeStorageCheck(summary, options);
}

export async function resolveRecordingEgress(recording: MeetingRecording, info: EgressInfo) {
  const summary = summarizeEgress(info);
  if (
    (summary.status !== "completed" && summary.errorCode !== "recording_file_missing") ||
    (info.status !== EgressStatus.EGRESS_COMPLETE &&
      info.status !== EgressStatus.EGRESS_LIMIT_REACHED)
  ) {
    return summary;
  }

  const objectExists = await recordingObjectExists(recording.meetingId, recording.id);
  const startedAt = recording.startedAt ?? recording.createdAt;
  const canRetry = Date.now() - startedAt.getTime() < 5 * 60 * 1000;
  return mergeRecordingStorageResult(summary, {
    objectExists,
    canRetry,
    egressDurationSeconds: getEgressDurationSeconds(info),
  });
}

function getEgressDurationSeconds(info: EgressInfo): number | null {
  const fileDuration = Number(info.fileResults[0]?.duration ?? 0);
  if (Number.isFinite(fileDuration) && fileDuration > 0) {
    return Math.floor(fileDuration / 1_000_000_000);
  }

  const duration = Number(info.endedAt) - Number(info.startedAt);
  return Number.isFinite(duration) && duration > 0
    ? Math.floor(duration / 1_000_000_000)
    : null;
}

export async function getLatestMeetingRecording(
  userId: string,
  meetingId: string,
  email?: string | null,
): Promise<MeetingRecording | null> {
  return withUserDatabase(
    userId,
    async (transaction) => {
      const [recording] = await transaction
        .select({
          id: recordings.id,
          meetingId: recordings.meetingId,
          status: recordings.status,
          objectKey: recordings.objectKey,
          egressId: recordings.egressId,
          durationSeconds: recordings.durationSeconds,
          errorCode: recordings.errorCode,
          startedAt: recordings.startedAt,
          completedAt: recordings.completedAt,
          createdAt: recordings.createdAt,
        })
        .from(recordings)
        .where(eq(recordings.meetingId, meetingId))
        .orderBy(desc(recordings.createdAt))
        .limit(1);
      return recording ?? null;
    },
    { email },
  );
}

export async function createPendingMeetingRecording(
  userId: string,
  meetingId: string,
): Promise<
  | { kind: "created"; recording: MeetingRecording }
  | { kind: "unavailable" }
  | { kind: "already-active" }
> {
  return withUserDatabase(userId, async (transaction) => {
    const [meeting] = await transaction
      .select({ id: meetings.id, status: meetings.status })
      .from(meetings)
      .where(and(eq(meetings.id, meetingId), eq(meetings.ownerId, userId)))
      .limit(1);

    if (!meeting || meeting.status !== "active") return { kind: "unavailable" as const };

    const [activeRecording] = await transaction
      .select({ id: recordings.id })
      .from(recordings)
      .where(and(eq(recordings.meetingId, meetingId), inArray(recordings.status, activeStates)))
      .limit(1);

    if (activeRecording) return { kind: "already-active" as const };

    const recordingId = crypto.randomUUID();
    const [recording] = await transaction
      .insert(recordings)
      .values({
        id: recordingId,
        meetingId,
        status: "pending",
        objectKey: recordingObjectKey(meetingId, recordingId),
      })
      .returning({
        id: recordings.id,
        meetingId: recordings.meetingId,
        status: recordings.status,
        objectKey: recordings.objectKey,
        egressId: recordings.egressId,
        durationSeconds: recordings.durationSeconds,
        errorCode: recordings.errorCode,
        startedAt: recordings.startedAt,
        completedAt: recordings.completedAt,
        createdAt: recordings.createdAt,
      });

    if (!recording) throw new Error("Recording insert returned no ID.");
    return { kind: "created" as const, recording };
  });
}

export async function updateMeetingRecording(
  userId: string,
  recordingId: string,
  values: {
    egressId?: string;
    status: RecordingState;
    durationSeconds?: number | null;
    errorCode?: string | null;
    startedAt?: Date | null;
    completedAt?: Date | null;
  },
): Promise<MeetingRecording | null> {
  return withUserDatabase(userId, async (transaction) => {
    const [recording] = await transaction
      .update(recordings)
      .set(values)
      .where(eq(recordings.id, recordingId))
      .returning({
        id: recordings.id,
        meetingId: recordings.meetingId,
        status: recordings.status,
        objectKey: recordings.objectKey,
        egressId: recordings.egressId,
        durationSeconds: recordings.durationSeconds,
        errorCode: recordings.errorCode,
        startedAt: recordings.startedAt,
        completedAt: recordings.completedAt,
        createdAt: recordings.createdAt,
      });
    return recording ?? null;
  });
}

export async function refreshMeetingRecording(
  userId: string,
  recording: MeetingRecording,
): Promise<{ recording: MeetingRecording; readyToStop: boolean }> {
  const recoverableMissingFile =
    recording.status === "failed" && recording.errorCode === "recording_file_missing";
  if (
    !recording.egressId ||
    (!activeStates.includes(recording.status) && !recoverableMissingFile)
  ) {
    return { recording, readyToStop: false };
  }

  const info = await getRoomRecordingEgress(recording.egressId);
  if (!info) return { recording, readyToStop: false };

  const summary = await resolveRecordingEgress(recording, info);
  const updated = await updateMeetingRecording(userId, recording.id, {
    status: summary.status,
    durationSeconds: summary.durationSeconds,
    errorCode: summary.errorCode,
    completedAt: summary.status === "completed" || summary.status === "failed" ? new Date() : null,
  });
  return {
    recording: updated ?? recording,
    readyToStop: summary.status === "recording" && isRecordingEgressReady(info),
  };
}

export async function stopActiveMeetingRecording(
  userId: string,
  meetingId: string,
): Promise<"none" | "stopping" | "check-needed"> {
  const recording = await withUserDatabase(userId, async (transaction) => {
    const [activeRecording] = await transaction
      .select({
        id: recordings.id,
        meetingId: recordings.meetingId,
        status: recordings.status,
        objectKey: recordings.objectKey,
        egressId: recordings.egressId,
        durationSeconds: recordings.durationSeconds,
        errorCode: recordings.errorCode,
        startedAt: recordings.startedAt,
        completedAt: recordings.completedAt,
        createdAt: recordings.createdAt,
      })
      .from(recordings)
      .where(and(eq(recordings.meetingId, meetingId), inArray(recordings.status, activeStates)))
      .orderBy(desc(recordings.createdAt))
      .limit(1);
    return activeRecording ?? null;
  });

  if (!recording) return "none";
  if (!recording.egressId) {
    await updateMeetingRecording(userId, recording.id, {
      status: "failed",
      errorCode: "egress_id_missing",
      completedAt: new Date(),
    });
    return "check-needed";
  }

  try {
    const info = await stopRoomRecording(recording.egressId);
    const summary = await resolveRecordingEgress(recording, info);
    await updateMeetingRecording(userId, recording.id, {
      status: summary.status,
      durationSeconds: summary.durationSeconds,
      errorCode: summary.errorCode,
      completedAt:
        summary.status === "completed" || summary.status === "failed" ? new Date() : null,
    });
    return summary.status === "failed" ? "check-needed" : "stopping";
  } catch {
    await updateMeetingRecording(userId, recording.id, {
      status: "processing",
      errorCode: null,
    });
    return "check-needed";
  }
}
