import { and, desc, eq, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { recordings, withUserDatabase } from "@meetflow/db";

import { getCurrentUser, getVerifiedUserEmail } from "@/lib/auth";
import { getMeetingDetails } from "@/lib/meetings";
import { getMeetingTranscript } from "@/lib/transcripts";

type RouteContext = { params: Promise<{ meetingId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { meetingId } = await params;
  if (!z.string().uuid().safeParse(meetingId).success) {
    return NextResponse.json({ error: "That meeting link is invalid." }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Sign in to view this transcript." }, { status: 401 });
  const details = await getAuthorizedMeeting(user.id, meetingId);
  if (!details) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });

  const transcript = await getMeetingTranscript(user.id, meetingId);
  return NextResponse.json(
    { transcript: toPublicTranscript(transcript) },
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
  if (!user)
    return NextResponse.json({ error: "Sign in to request transcription." }, { status: 401 });
  const details = await getAuthorizedMeeting(user.id, meetingId);
  if (!details) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
  if (details.meeting.ownerId !== user.id) {
    return NextResponse.json(
      { error: "Only the meeting host can request transcription." },
      { status: 403 },
    );
  }

  const [recording] = await withUserDatabase(user.id, async (transaction) =>
    transaction
      .select({ id: recordings.id })
      .from(recordings)
      .where(
        and(
          eq(recordings.meetingId, meetingId),
          eq(recordings.status, "completed"),
          isNotNull(recordings.objectKey),
        ),
      )
      .orderBy(desc(recordings.createdAt))
      .limit(1),
  );

  if (!recording) {
    return NextResponse.json(
      { error: "A completed recording is required before transcription." },
      { status: 409 },
    );
  }

  try {
    const [{ status }] = await withUserDatabase(
      user.id,
      async (transaction) =>
        await transaction
          .select({
            status: sql<"pending" | "processing" | "completed" | "failed">`
          public.request_meeting_transcription(${meetingId}::uuid, ${recording.id}::uuid)
        `,
          })
          .from(recordings)
          .where(eq(recordings.id, recording.id)),
    );
    const transcript = await getMeetingTranscript(user.id, meetingId);
    return NextResponse.json(
      {
        transcript: toPublicTranscript(transcript),
        status,
        error:
          status === "failed" && transcript?.attemptCount === 3
            ? "This recording reached the three-attempt limit."
            : null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "UNKNOWN";
    console.error("Meeting transcription request failed.", { code });
    return NextResponse.json({ error: "We could not queue this transcript." }, { status: 503 });
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

function toPublicTranscript(transcript: Awaited<ReturnType<typeof getMeetingTranscript>>) {
  if (!transcript) return null;
  return {
    attemptCount: transcript.attemptCount,
    content: transcript.content,
    segments: transcript.segments,
    status: transcript.status,
    errorMessage: transcript.errorMessage,
    completedAt: transcript.completedAt?.toISOString() ?? null,
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
