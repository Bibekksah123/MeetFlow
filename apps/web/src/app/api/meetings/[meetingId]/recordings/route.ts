import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser, getVerifiedUserEmail } from "@/lib/auth";
import { hasActiveRoomMedia } from "@/lib/livekit/server";
import { getMeetingDetails } from "@/lib/meetings";
import { readBoundedRequestBody, RequestBodyTooLargeError } from "@/lib/request-body";
import {
  createPendingMeetingRecording,
  getLatestMeetingRecording,
  refreshMeetingRecording,
  resolveRecordingEgress,
  updateMeetingRecording,
} from "@/lib/recordings";
import {
  getRecordingStorageConfig,
  getRoomRecordingEgress,
  isRecordingEgressReady,
  RecordingConfigurationError,
  startRoomRecording,
  stopRoomRecording,
  summarizeEgress,
} from "@/lib/livekit/recordings";

type RouteContext = { params: Promise<{ meetingId: string }> };
const recordingRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), participantsConsented: z.boolean().optional() }).strict(),
  z.object({ action: z.literal("stop") }).strict(),
]);
const MAX_BODY_BYTES = 4_096;

export async function GET(_request: Request, { params }: RouteContext) {
  const { meetingId } = await params;
  if (!z.string().uuid().safeParse(meetingId).success) {
    return NextResponse.json({ error: "That meeting link is invalid." }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Sign in to view this recording." }, { status: 401 });
  const details = await getAuthorizedMeeting(user.id, meetingId);
  if (!details) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });

  let recording = await getLatestMeetingRecording(user.id, meetingId);
  let readyToStop = false;
  if (details.meeting.ownerId === user.id && recording) {
    try {
      const refreshed = await refreshMeetingRecording(user.id, recording);
      recording = refreshed.recording;
      readyToStop = refreshed.readyToStop;
      revalidatePath(`/meeting/${meetingId}`);
    } catch (error) {
      console.error("Meeting recording status refresh failed.", { code: getErrorCode(error) });
    }
  } else if (recording?.status === "recording" && recording.egressId) {
    try {
      readyToStop = isRecordingEgressReady(await getRoomRecordingEgress(recording.egressId));
    } catch (error) {
      console.error("Meeting recording readiness check failed.", { code: getErrorCode(error) });
    }
  }

  return NextResponse.json(
    { recording: toPublicRecording(recording, readyToStop) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request, { params }: RouteContext) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "This request is not allowed." }, { status: 403 });
  }

  const { meetingId } = await params;
  if (!z.string().uuid().safeParse(meetingId).success) {
    return NextResponse.json({ error: "That meeting link is invalid." }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in to control recording." }, { status: 401 });
  const details = await getAuthorizedMeeting(user.id, meetingId);
  if (!details) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
  if (details.meeting.ownerId !== user.id) {
    return NextResponse.json(
      { error: "Only the meeting host can control recording." },
      { status: 403 },
    );
  }

  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Send recording controls as JSON." }, { status: 415 });
  }

  let body: unknown;
  try {
    body = JSON.parse(await readBoundedRequestBody(request, MAX_BODY_BYTES));
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: "That recording request is too large." }, { status: 413 });
    }
    return NextResponse.json({ error: "That recording request is not valid." }, { status: 400 });
  }

  const parsed = recordingRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "That recording request is not valid." }, { status: 400 });
  }

  if (details.meeting.status !== "active") {
    return NextResponse.json({ error: "Start the meeting before recording." }, { status: 409 });
  }

  if (parsed.data.action === "start") {
    if (parsed.data.participantsConsented !== true) {
      return NextResponse.json(
        { error: "Confirm that all participants have agreed before recording." },
        { status: 400 },
      );
    }

    try {
      getRecordingStorageConfig();
    } catch (error) {
      if (error instanceof RecordingConfigurationError) {
        return NextResponse.json(
          { error: "Recording storage is not configured." },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: "Recording is temporarily unavailable." }, { status: 503 });
    }

    let latest = await getLatestMeetingRecording(user.id, meetingId);
    const recoverableMissingFile =
      latest?.status === "failed" && latest.errorCode === "recording_file_missing";
    if (
      latest &&
      (["pending", "recording", "processing"].includes(latest.status) || recoverableMissingFile)
    ) {
      if (latest.egressId) {
        try {
          latest = (await refreshMeetingRecording(user.id, latest)).recording;
        } catch (error) {
          console.error("Meeting recording preflight failed.", { code: getErrorCode(error) });
        }
      }

      if (latest && ["pending", "recording", "processing"].includes(latest.status)) {
        return NextResponse.json(
          { error: "A recording is already in progress or being finalized." },
          { status: 409 },
        );
      }
    }

    try {
      if (!(await hasActiveRoomMedia(meetingId))) {
        return NextResponse.json(
          {
            error:
              "Turn on your microphone or camera and wait for it to connect before starting a recording.",
          },
          { status: 409 },
        );
      }
    } catch (error) {
      console.error("Meeting recording media preflight failed.", { code: getErrorCode(error) });
      return NextResponse.json({ error: "Recording is temporarily unavailable." }, { status: 503 });
    }

    let created;
    try {
      created = await createPendingMeetingRecording(user.id, meetingId);
    } catch (error) {
      console.error("Meeting recording reservation failed.", { code: getErrorCode(error) });
      return NextResponse.json({ error: "We could not start this recording." }, { status: 409 });
    }

    if (created.kind === "unavailable") {
      return NextResponse.json(
        { error: "Only the host of an active meeting can start a recording." },
        { status: 409 },
      );
    }
    if (created.kind === "already-active") {
      return NextResponse.json(
        { error: "A recording is already in progress or being finalized." },
        { status: 409 },
      );
    }

    let egressId: string | null = null;
    try {
      const egress = await startRoomRecording(meetingId, created.recording.id);
      egressId = egress.egressId;
      const summary = summarizeEgress(egress);
      const recording = await updateMeetingRecording(user.id, created.recording.id, {
        egressId,
        status: summary.status,
        startedAt: new Date(),
        durationSeconds: summary.durationSeconds,
        errorCode: summary.errorCode,
        completedAt:
          summary.status === "completed" || summary.status === "failed" ? new Date() : null,
      });
      if (!recording) throw new Error("Recording state could not be saved.");

      revalidatePath(`/meeting/${meetingId}`);
      return NextResponse.json(
        { recording: toPublicRecording(recording, isRecordingEgressReady(egress)) },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } catch (error) {
      if (egressId) {
        try {
          await stopRoomRecording(egressId);
        } catch {
          // The reservation below remains failed and the room cleanup is best-effort.
        }
      }
      await updateMeetingRecording(user.id, created.recording.id, {
        status: "failed",
        errorCode: "egress_start_failed",
        completedAt: new Date(),
      });
      console.error("Meeting recording start failed.", { code: getErrorCode(error) });
      return NextResponse.json({ error: "We could not start this recording." }, { status: 503 });
    }
  }

  const current = await getLatestMeetingRecording(user.id, meetingId);
  if (!current || current.status !== "recording" || !current.egressId) {
    return NextResponse.json({ error: "There is no active recording to stop." }, { status: 409 });
  }

  try {
    const egressInfo = await getRoomRecordingEgress(current.egressId);
    if (!egressInfo) {
      const recording = await updateMeetingRecording(user.id, current.id, {
        status: "failed",
        errorCode: "egress_not_found",
        completedAt: new Date(),
      });
      return NextResponse.json(
        {
          error: "LiveKit could not find this recording. Retry while the meeting is active.",
          recording: toPublicRecording(recording, false),
        },
        { status: 409 },
      );
    }
    if (!isRecordingEgressReady(egressInfo)) {
      const refreshed = await refreshMeetingRecording(user.id, current);
      const failed = refreshed.recording.status === "failed";
      return NextResponse.json(
        {
          error: failed
            ? "LiveKit could not start this recording. The host can retry."
            : "The recording is still starting. Wait until it is active before stopping it.",
          recording: toPublicRecording(refreshed.recording, refreshed.readyToStop),
        },
        { status: failed ? 409 : 425 },
      );
    }

    const egress = await stopRoomRecording(current.egressId);
    const summary = await resolveRecordingEgress(current, egress);
    const recording = await updateMeetingRecording(user.id, current.id, {
      status: summary.status,
      durationSeconds: summary.durationSeconds,
      errorCode: summary.errorCode,
      completedAt:
        summary.status === "completed" || summary.status === "failed" ? new Date() : null,
    });
    if (!recording) throw new Error("Recording state could not be saved.");
    revalidatePath(`/meeting/${meetingId}`);
    return NextResponse.json(
      { recording: toPublicRecording(recording, false) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Meeting recording stop failed.", { code: getErrorCode(error) });
    return NextResponse.json({ error: "We could not stop this recording." }, { status: 503 });
  }
}

async function getAuthorizedMeeting(userId: string, meetingId: string) {
  let details = await getMeetingDetails(userId, meetingId);
  if (!details) {
    const email = await getVerifiedUserEmail(userId);
    if (email) details = await getMeetingDetails(userId, meetingId, email);
  }
  return details;
}

function toPublicRecording(
  recording: Awaited<ReturnType<typeof getLatestMeetingRecording>>,
  readyToStop = false,
) {
  if (!recording) return null;
  return {
    id: recording.id,
    status: recording.status,
    readyToStop,
    durationSeconds: recording.durationSeconds,
    errorCode: recording.errorCode,
    startedAt: recording.startedAt?.toISOString() ?? null,
    completedAt: recording.completedAt?.toISOString() ?? null,
    createdAt: recording.createdAt.toISOString(),
  };
}

function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const requestOrigin = new URL(request.url).origin;
    const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const configuredOrigin = configuredSiteUrl ? new URL(configuredSiteUrl).origin : null;
    return new URL(origin).origin === requestOrigin || new URL(origin).origin === configuredOrigin;
  } catch {
    return false;
  }
}

function getErrorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Za-z0-9_-]{1,48}$/.test(error.code)
  ) {
    return error.code;
  }
  if (error instanceof Error && /^[A-Za-z0-9_-]{1,48}$/.test(error.name)) return error.name;
  return "UNKNOWN";
}
