import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser, getVerifiedUserEmail } from "@/lib/auth";
import { authorizeMeetingJoin } from "@/lib/meeting-access";
import {
  createMeetingAccessToken,
  getLiveKitServerConfig,
  LiveKitConfigurationError,
} from "@/lib/livekit/server";

type RouteContext = { params: Promise<{ meetingId: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
  if (!isSameOriginRequest(_request)) {
    return NextResponse.json({ error: "This request is not allowed." }, { status: 403 });
  }

  const { meetingId } = await params;
  if (!z.string().uuid().safeParse(meetingId).success) {
    return NextResponse.json({ error: "That meeting link is invalid." }, { status: 400 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to join this meeting." }, { status: 401 });
  }

  let config;
  try {
    config = getLiveKitServerConfig();
  } catch (error) {
    if (error instanceof LiveKitConfigurationError) {
      return NextResponse.json(
        { error: "Video meetings are not configured yet." },
        { status: 503 },
      );
    }
    console.error("LiveKit configuration check failed.", { code: getErrorCode(error) });
    return NextResponse.json(
      { error: "Video meetings are temporarily unavailable." },
      { status: 503 },
    );
  }

  try {
    let access = await authorizeMeetingJoin({
      userId: user.id,
      meetingId,
      verifiedEmail: null,
    });

    if (access.kind === "not-found") {
      const verifiedEmail = await getVerifiedUserEmail(user.id);
      if (verifiedEmail) {
        access = await authorizeMeetingJoin({ userId: user.id, meetingId, verifiedEmail });
      }
    }

    if (access.kind === "not-found" || access.kind === "forbidden") {
      return NextResponse.json(
        { error: "This meeting is unavailable or you are not invited." },
        { status: 404 },
      );
    }

    if (access.kind === "ended") {
      return NextResponse.json({ error: "This meeting has ended." }, { status: 409 });
    }

    const token = await createMeetingAccessToken({
      roomName: meetingId,
      identity: `meetflow-${crypto.randomUUID()}`,
      participantName: user.displayName.trim().slice(0, 80) || "MeetFlow participant",
    });

    if (access.isHost) {
      revalidatePath(`/meeting/${meetingId}`);
      revalidatePath("/meetings");
      revalidatePath("/dashboard");
    }

    return NextResponse.json(
      { token, serverUrl: config.clientUrl },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("LiveKit access request failed.", { code: getErrorCode(error) });
    return NextResponse.json(
      { error: "We could not join this meeting. Please try again." },
      { status: 503 },
    );
  }
}

function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const requestOrigin = new URL(request.url).origin;
    const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    const configuredOrigin = configuredSiteUrl ? new URL(configuredSiteUrl).origin : null;
    const requestOriginHeader = new URL(origin).origin;
    return requestOriginHeader === requestOrigin || requestOriginHeader === configuredOrigin;
  } catch {
    return false;
  }
}

function getErrorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return "UNKNOWN";
}
