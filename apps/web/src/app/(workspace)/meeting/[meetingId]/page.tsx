import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";

import { Badge, buttonStyles, Card, ErrorState } from "@meetflow/ui";

import { MeetingStatusBadge } from "@/components/meeting-status-badge";
import { getVerifiedUserEmail, requireUser } from "@/lib/auth";
import { getMeetingDetails, listMeetingAutomationHistory } from "@/lib/meetings";
import { getMeetingAnalysis } from "@/lib/meeting-analysis";
import { getLatestMeetingRecording } from "@/lib/recordings";
import { getMeetingTranscript } from "@/lib/transcripts";

import { CopyMeetingLink } from "./copy-meeting-link";
import { LiveMeetingRoom } from "./live-meeting-room";
import { MeetingAnalysisPanel } from "./meeting-analysis-panel";
import { MeetingStatusControls } from "./meeting-status-controls";
import { RecordingControls } from "./recording-controls";
import { TranscriptPanel } from "./transcript-panel";
import { MeetingAutomationHistory } from "./automation-history";

export const metadata: Metadata = { title: "Meeting room" };

export default async function MeetingRoomPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;
  if (!z.string().uuid().safeParse(meetingId).success) notFound();

  const user = await requireUser();
  let details: Awaited<ReturnType<typeof getMeetingDetails>>;
  let recording: Awaited<ReturnType<typeof getLatestMeetingRecording>>;
  let transcript: Awaited<ReturnType<typeof getMeetingTranscript>> = null;
  let analysis: Awaited<ReturnType<typeof getMeetingAnalysis>> = null;
  let automationHistory: Awaited<ReturnType<typeof listMeetingAutomationHistory>> = [];
  let databaseEmail: string | null = null;

  try {
    details = await getMeetingDetails(user.id, meetingId);
    if (!details) {
      const verifiedEmail = await getVerifiedUserEmail(user.id);
      if (verifiedEmail) {
        databaseEmail = verifiedEmail;
        details = await getMeetingDetails(user.id, meetingId, verifiedEmail);
      }
    }
    recording = details ? await getLatestMeetingRecording(user.id, meetingId, databaseEmail) : null;
    transcript = details ? await getMeetingTranscript(user.id, meetingId, databaseEmail) : null;
    analysis = details ? await getMeetingAnalysis(user.id, meetingId, databaseEmail) : null;
    automationHistory =
      details?.meeting.ownerId === user.id
        ? await listMeetingAutomationHistory(user.id, meetingId)
        : [];
  } catch {
    return (
      <ErrorState description="We could not load this meeting. Refresh the page and try again." />
    );
  }

  if (!details) notFound();

  const { meeting, participants } = details;
  const isHost = meeting.ownerId === user.id;
  const initialRecording = recording
    ? {
        id: recording.id,
        status: recording.status,
        readyToStop: false,
        durationSeconds: recording.durationSeconds,
        errorCode: recording.errorCode,
        startedAt: recording.startedAt?.toISOString() ?? null,
        completedAt: recording.completedAt?.toISOString() ?? null,
        createdAt: recording.createdAt.toISOString(),
      }
    : null;
  const initialTranscript = transcript
    ? {
        attemptCount: transcript.attemptCount,
        content: transcript.content,
        segments: transcript.segments,
        status: transcript.status,
        errorMessage: transcript.errorMessage,
        completedAt: transcript.completedAt?.toISOString() ?? null,
      }
    : null;
  const initialAnalysis = analysis
    ? {
        ...analysis,
        summary: {
          ...analysis.summary,
          generatedAt: analysis.summary.generatedAt,
        },
      }
    : null;

  return (
    <div className="space-y-7">
      <div className="border-line border-b pb-6">
        <Link
          href="/meetings"
          className={`${buttonStyles({ variant: "ghost", size: "sm" })} mb-4 -ml-3`}
        >
          <span aria-hidden="true">←</span> All meetings
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-brand mb-3 text-xs font-semibold tracking-[0.16em] uppercase">
              Meeting room
            </p>
            <h1 className="text-ink text-3xl font-semibold tracking-[-0.04em] break-words">
              {meeting.title}
            </h1>
            <p className="text-muted mt-2 max-w-2xl text-sm leading-6">
              {meeting.description || "No description added."}
            </p>
          </div>
          <MeetingStatusBadge status={meeting.status} />
        </div>
      </div>

      <nav aria-label="Meeting sections" className="flex flex-wrap gap-2">
        <SectionLink href="#recording">Recording</SectionLink>
        <SectionLink href="#transcript">Transcript</SectionLink>
        <SectionLink href="#analysis">Summary & decisions</SectionLink>
        <SectionLink href="#action-items">Tasks</SectionLink>
        {isHost ? <SectionLink href="#automation-history">Automation history</SectionLink> : null}
        {transcript?.status === "completed" ? (
          <Link
            href={`/meeting/${meeting.id}/ask`}
            className={buttonStyles({ variant: "secondary", size: "sm" })}
          >
            Ask AI
          </Link>
        ) : null}
      </nav>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.8fr)]">
        <div className="space-y-5">
          {meeting.status === "completed" ? (
            <Card className="border-line p-5 sm:p-6">
              <h2 className="text-ink text-base font-semibold">This meeting has ended</h2>
              <p className="text-muted mt-2 text-sm leading-6">
                The room is closed. Review the recording, transcript, and meeting notes below.
              </p>
            </Card>
          ) : (
            <LiveMeetingRoom
              meetingId={meeting.id}
              meetingTitle={meeting.title}
              meetingStatus={meeting.status}
              isHost={isHost}
            />
          )}

          <RecordingControls
            meetingId={meeting.id}
            meetingStatus={meeting.status}
            isHost={isHost}
            initialRecording={initialRecording}
          />

          <TranscriptPanel
            meetingId={meeting.id}
            isHost={isHost}
            recordingStatus={recording?.status ?? null}
            initialTranscript={initialTranscript}
          />

          <MeetingAnalysisPanel
            meetingId={meeting.id}
            isHost={isHost}
            recordingStatus={recording?.status ?? null}
            transcriptStatus={transcript?.status ?? null}
            initialAnalysis={initialAnalysis}
          />

          {isHost ? <MeetingAutomationHistory rows={automationHistory} /> : null}

          <Card className="p-5 sm:p-6">
            <div className="mb-5">
              <h2 className="text-ink text-base font-semibold">Room link</h2>
              <p className="text-muted mt-1 text-sm leading-5">
                Share this link with an invited participant. They must sign in with the invited
                email address to join.
              </p>
            </div>
            <CopyMeetingLink meetingId={meeting.id} />
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-ink text-base font-semibold">Participants</h2>
                <p className="text-muted mt-1 text-sm">
                  {isHost
                    ? `${participants.length} people with access`
                    : "You have access to this meeting"}
                </p>
              </div>
              <Link
                href="/meetings/new"
                className={buttonStyles({ variant: "secondary", size: "sm" })}
              >
                New meeting
              </Link>
            </div>
            {participants.length > 0 ? (
              <ul className="divide-line divide-y">
                {participants.map((participant) => (
                  <li
                    key={participant.id}
                    className="flex min-w-0 items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="text-ink min-w-0 truncate text-sm">
                      {participant.email ?? "MeetFlow participant"}
                    </span>
                    <Badge variant={participant.status === "accepted" ? "success" : "neutral"}>
                      {participant.status === "accepted" ? "Accepted" : "Can join"}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted rounded-xl bg-[#f6f8fb] px-4 py-3 text-sm">
                No participants added yet.
              </p>
            )}
            <p className="text-muted mt-4 text-xs leading-5">
              MeetFlow does not email participants yet. Share the room link yourself; they can join
              after signing in with an email address you added here.
            </p>
          </Card>
        </div>

        <div className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5 sm:p-6">
            <div className="mb-4">
              <h2 className="text-ink text-base font-semibold">Meeting status</h2>
              <p className="text-muted mt-1 text-sm leading-5">
                {meeting.status === "completed"
                  ? "This room is closed. Its meeting materials remain available below."
                  : "Joining starts the meeting. Ending it disconnects everyone in the room."}
              </p>
            </div>
            <MeetingStatusControls meetingId={meeting.id} status={meeting.status} isHost={isHost} />
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="text-ink text-base font-semibold">Room details</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-muted">Created</dt>
                <dd className="text-ink text-right">{formatDate(meeting.createdAt)}</dd>
              </div>
              {meeting.scheduledAt ? (
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted">Scheduled</dt>
                  <dd className="text-ink text-right">{formatDate(meeting.scheduledAt)}</dd>
                </div>
              ) : null}
              {meeting.startedAt ? (
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted">Marked active</dt>
                  <dd className="text-ink text-right">{formatDate(meeting.startedAt)}</dd>
                </div>
              ) : null}
              {meeting.endedAt ? (
                <div className="flex items-start justify-between gap-3">
                  <dt className="text-muted">Completed</dt>
                  <dd className="text-ink text-right">{formatDate(meeting.endedAt)}</dd>
                </div>
              ) : null}
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SectionLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={buttonStyles({ variant: "secondary", size: "sm" })}>
      {children}
    </Link>
  );
}

function formatDate(value: Date) {
  return `${new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(value)} UTC`;
}
