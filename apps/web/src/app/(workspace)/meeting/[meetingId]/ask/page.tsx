import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { buttonStyles, Card, ErrorState } from "@meetflow/ui";

import { getVerifiedUserEmail, requireUser } from "@/lib/auth";
import { getMeetingDetails } from "@/lib/meetings";
import { getMeetingTranscript } from "@/lib/transcripts";

import { MeetingAskChat } from "./meeting-ask-chat";

export const metadata: Metadata = { title: "Ask about this meeting" };

export default async function AskAboutMeetingPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;
  if (!z.string().uuid().safeParse(meetingId).success) notFound();

  const user = await requireUser();
  let email: string | null = null;
  let details: Awaited<ReturnType<typeof getMeetingDetails>>;
  let transcript: Awaited<ReturnType<typeof getMeetingTranscript>> = null;

  try {
    details = await getMeetingDetails(user.id, meetingId);
    if (!details) {
      const verifiedEmail = await getVerifiedUserEmail(user.id);
      if (verifiedEmail) {
        email = verifiedEmail;
        details = await getMeetingDetails(user.id, meetingId, verifiedEmail);
      }
    }
    transcript = details ? await getMeetingTranscript(user.id, meetingId, email) : null;
  } catch {
    return (
      <ErrorState description="We could not load this meeting. Refresh the page and try again." />
    );
  }

  if (!details) notFound();

  const hasTranscript = transcript?.status === "completed" && Boolean(transcript.content?.trim());

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={`/meeting/${meetingId}`}
          className={`${buttonStyles({ variant: "ghost", size: "sm" })} mb-4 -ml-3`}
        >
          <span aria-hidden="true">←</span> Back to meeting
        </Link>
        <p className="text-brand mb-2 text-xs font-semibold tracking-[0.16em] uppercase">
          Meeting Q&amp;A
        </p>
        <h1 className="text-ink text-3xl font-semibold tracking-[-0.04em] break-words">
          {details.meeting.title}
        </h1>
        <p className="text-muted mt-2 text-sm leading-6">
          Ask about the discussion, decisions, or follow-ups. Answers include excerpts from the
          transcript or saved AI notes so you can check the source.
        </p>
      </div>

      {hasTranscript ? (
        <>
          <MeetingAskChat meetingId={meetingId} />
          <p className="text-muted px-1 text-xs leading-5">
            Chat history stays in this browser session and is not sent with later questions.
          </p>
        </>
      ) : (
        <Card className="p-5 sm:p-6">
          <h2 className="text-ink text-base font-semibold">Transcript not ready</h2>
          <p className="text-muted mt-2 text-sm leading-6">
            {transcript?.status === "failed"
              ? "Transcription failed. Once a transcript is available, you can ask questions grounded in the meeting."
              : transcript?.status === "pending" || transcript?.status === "processing"
                ? "Transcription is still processing. Come back when it is complete to ask questions about this meeting."
                : "A completed transcript is needed before you can ask questions about this meeting."}
          </p>
          <Link
            href={`/meeting/${meetingId}`}
            className={`${buttonStyles({ variant: "secondary", size: "sm" })} mt-4`}
          >
            View meeting status
          </Link>
        </Card>
      )}
    </div>
  );
}
