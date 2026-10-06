import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser, getVerifiedUserEmail } from "@/lib/auth";
import { answerMeetingQuestion, consumeMeetingAskRateLimit } from "@/lib/meeting-ask";
import { getMeetingAnalysis } from "@/lib/meeting-analysis";
import { getMeetingDetails } from "@/lib/meetings";
import { getMeetingTranscript } from "@/lib/transcripts";
import { readBoundedRequestBody, RequestBodyTooLargeError } from "@/lib/request-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4_096;
const requestSchema = z
  .object({
    question: z.string().trim().min(1).max(1_200),
    privacyConfirmed: z.literal(true),
  })
  .strict();

type RouteContext = { params: Promise<{ meetingId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  if (!isSameOriginRequest(request)) {
    return privateJson({ error: "This request is not allowed." }, 403);
  }

  const { meetingId } = await params;
  if (!z.string().uuid().safeParse(meetingId).success) {
    return privateJson({ error: "That meeting link is invalid." }, 400);
  }

  const user = await getCurrentUser();
  if (!user) return privateJson({ error: "Sign in to ask about this meeting." }, 401);

  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return privateJson({ error: "Send your question as JSON." }, 415);
  }

  try {
    const rawBody = await readBoundedRequestBody(request, MAX_BODY_BYTES);
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return privateJson({ error: "The question request is invalid." }, 400);
    }

    const parsedBody = requestSchema.safeParse(body);
    if (!parsedBody.success) {
      return privateJson(
        { error: "Confirm the Gemini data notice and enter a question under 1,200 characters." },
        400,
      );
    }

    let accessEmail: string | null = null;
    let details = await getMeetingDetails(user.id, meetingId);
    if (!details) {
      const verifiedEmail = await getVerifiedUserEmail(user.id);
      if (verifiedEmail) {
        accessEmail = verifiedEmail;
        details = await getMeetingDetails(user.id, meetingId, verifiedEmail);
      }
    }
    if (!details) return privateJson({ error: "Meeting not found." }, 404);

    const transcript = await getMeetingTranscript(user.id, meetingId, accessEmail);
    if (transcript?.status !== "completed" || !transcript.content?.trim()) {
      return privateJson(
        { error: "A completed transcript is needed before you can ask about this meeting." },
        409,
      );
    }

    if (!consumeMeetingAskRateLimit(user.id)) {
      return privateJson(
        { error: "You have asked several questions recently. Please wait a minute and try again." },
        429,
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("Meeting question service is not configured.", { category: "configuration" });
      return privateJson({ error: "Meeting questions are temporarily unavailable." }, 503);
    }

    const analysis = await getMeetingAnalysis(user.id, meetingId, accessEmail);
    const answer = await answerMeetingQuestion(new GoogleGenAI({ apiKey }), {
      meetingTitle: details.meeting.title,
      question: parsedBody.data.question,
      transcript: transcript.content,
      segments: transcript.segments,
      analysis:
        analysis?.summary.status === "completed"
          ? {
              summary: analysis.summary,
              decisions: analysis.decisions,
              actionItems: analysis.actionItems,
            }
          : null,
    });

    return privateJson({ answer });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return privateJson({ error: "The question request is too large." }, 413);
    }

    const providerStatus = safeStatus(error);
    console.error("Meeting question request failed.", {
      category: "meeting_ask",
      errorName: safeErrorName(error),
      providerStatus,
    });
    if (providerStatus === 429) {
      return privateJson({ error: "The AI service is busy. Please try again shortly." }, 429);
    }
    return privateJson({ error: "We could not answer that question. Please try again." }, 502);
  }
}

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function safeStatus(error: unknown): number | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number" &&
    Number.isInteger(error.status) &&
    error.status >= 400 &&
    error.status <= 599
  ) {
    return error.status;
  }
  return null;
}

function safeErrorName(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string" &&
    /^[A-Za-z0-9_-]{1,48}$/.test(error.name)
  ) {
    return error.name;
  }
  return "UnknownError";
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
