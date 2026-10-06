import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";

import { meetings, withUserDatabase } from "@meetflow/db";
import { getCurrentUser, getVerifiedUserEmail } from "@/lib/auth";
import { getMeetingAnalysis } from "@/lib/meeting-analysis";
import { getMeetingDetails } from "@/lib/meetings";

type RouteContext = { params: Promise<{ meetingId: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { meetingId } = await params;
  if (!z.string().uuid().safeParse(meetingId).success) {
    return NextResponse.json({ error: "That meeting link is invalid." }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Sign in to view this meeting analysis." }, { status: 401 });

  let accessEmail: string | null = null;
  let details = await getMeetingDetails(user.id, meetingId);
  if (!details) {
    const verifiedEmail = await getVerifiedUserEmail(user.id);
    if (verifiedEmail) {
      accessEmail = verifiedEmail;
      details = await getMeetingDetails(user.id, meetingId, verifiedEmail);
    }
  }
  if (!details) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });

  try {
    const analysis = await getMeetingAnalysis(user.id, meetingId, accessEmail);
    return NextResponse.json({ analysis }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = safeErrorCode(error);
    console.error("Meeting analysis read failed.", { code });
    return NextResponse.json(
      { error: "We could not load this meeting analysis." },
      { status: 503 },
    );
  }
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
  if (!user) {
    return NextResponse.json({ error: "Sign in to retry this analysis." }, { status: 401 });
  }
  const { details, email } = await getAuthorizedMeeting(user.id, meetingId);
  if (!details) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
  if (details.meeting.ownerId !== user.id) {
    return NextResponse.json(
      { error: "Only the meeting host can retry analysis." },
      { status: 403 },
    );
  }

  try {
    const [result] = await withUserDatabase(
      user.id,
      (transaction) =>
        transaction
          .select({
            status: sql<"pending" | "processing" | "completed" | "failed">`
              public.request_meeting_analysis(${meetingId}::uuid)
            `,
          })
          .from(meetings)
          .where(eq(meetings.id, meetingId))
          .limit(1),
      { email },
    );

    const analysis = await getMeetingAnalysis(user.id, meetingId, email);
    revalidatePath(`/meeting/${meetingId}`);
    return NextResponse.json(
      { analysis, status: result?.status ?? "pending" },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const code = safeErrorCode(error);
    console.error("Meeting analysis retry request failed.", { code });
    if (code === "23514") {
      return NextResponse.json(
        { error: "A completed transcript is required before analysis." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "We could not retry this analysis." }, { status: 503 });
  }
}

async function getAuthorizedMeeting(userId: string, meetingId: string) {
  let email: string | null = null;
  let details = await getMeetingDetails(userId, meetingId);
  if (!details) {
    const verifiedEmail = await getVerifiedUserEmail(userId);
    if (verifiedEmail) {
      email = verifiedEmail;
      details = await getMeetingDetails(userId, meetingId, verifiedEmail);
    }
  }
  return { details, email };
}

function safeErrorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Za-z0-9_-]{1,48}$/.test(error.code)
  ) {
    return error.code;
  }
  return "UNKNOWN";
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
