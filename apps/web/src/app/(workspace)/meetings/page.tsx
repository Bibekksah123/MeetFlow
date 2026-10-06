import type { Metadata } from "next";
import Link from "next/link";

import { Badge, buttonStyles, Card, ErrorState } from "@meetflow/ui";

import { MeetingStatusBadge } from "@/components/meeting-status-badge";
import { getVerifiedUserEmail, requireUser } from "@/lib/auth";
import { listMeetings, type MeetingHistoryRecord } from "@/lib/meetings";

export const metadata: Metadata = { title: "Meetings" };

export default async function MeetingsPage() {
  const user = await requireUser();
  let meetingRows: MeetingHistoryRecord[] = [];
  let loadFailed = false;

  try {
    meetingRows = await listMeetings(user.id, 50, await getVerifiedUserEmail(user.id));
  } catch {
    loadFailed = true;
  }

  const upcoming = meetingRows
    .filter((meeting) => meeting.status === "scheduled")
    .sort(
      (left, right) =>
        (left.scheduledAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
        (right.scheduledAt?.getTime() ?? Number.MAX_SAFE_INTEGER),
    );
  const active = meetingRows
    .filter((meeting) => meeting.status === "active")
    .sort((left, right) => (right.startedAt?.getTime() ?? 0) - (left.startedAt?.getTime() ?? 0));
  const past = meetingRows
    .filter((meeting) => meeting.status === "completed")
    .sort((left, right) => (right.endedAt?.getTime() ?? 0) - (left.endedAt?.getTime() ?? 0));

  return (
    <div className="space-y-7">
      <div className="border-line flex flex-col justify-between gap-4 border-b pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-brand mb-3 text-xs font-semibold tracking-[0.16em] uppercase">
            Meeting space
          </p>
          <h1 className="text-ink text-3xl font-semibold tracking-[-0.04em]">Meetings</h1>
          <p className="text-muted mt-2 max-w-2xl text-sm leading-6">
            Find upcoming rooms, meetings in progress, and the recordings and follow-through from
            past conversations.
          </p>
        </div>
        <Link
          href="/meetings/new"
          className={buttonStyles({ className: "w-full whitespace-nowrap sm:w-auto" })}
        >
          Create meeting
        </Link>
      </div>

      {loadFailed ? (
        <ErrorState description="We could not load your meetings. Refresh the page and try again." />
      ) : meetingRows.length === 0 ? (
        <Card className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
          <span
            aria-hidden="true"
            className="bg-brand-soft text-brand grid size-12 place-items-center rounded-2xl"
          >
            <MeetingMark />
          </span>
          <h2 className="text-ink mt-4 text-base font-semibold">Your first meeting starts here</h2>
          <p className="text-muted mt-2 max-w-md text-sm leading-6">
            Create a room, add invitees, and keep the conversation connected to its follow-through.
          </p>
          <Link href="/meetings/new" className={`mt-5 ${buttonStyles({ size: "sm" })}`}>
            Create a meeting room
          </Link>
        </Card>
      ) : (
        <div className="space-y-8">
          <MeetingGroup
            title="Upcoming"
            description="Scheduled rooms and meetings ready to start."
            meetings={upcoming}
          />
          <MeetingGroup
            title="In progress"
            description="Rooms currently marked active."
            meetings={active}
          />
          <MeetingGroup
            title="Past meetings"
            description="Recordings, transcripts, AI notes, and follow-through."
            meetings={past}
          />
        </div>
      )}
    </div>
  );
}

function MeetingGroup({
  title,
  description,
  meetings,
}: {
  title: string;
  description: string;
  meetings: MeetingHistoryRecord[];
}) {
  return (
    <section aria-label={title}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-ink text-lg font-semibold">{title}</h2>
          <p className="text-muted mt-1 text-sm">{description}</p>
        </div>
        <span className="text-muted text-xs tabular-nums">{meetings.length}</span>
      </div>
      {meetings.length > 0 ? (
        <ul className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3">
          {meetings.map((meeting) => (
            <li key={meeting.id} className="min-w-0">
              <Link
                href={`/meeting/${meeting.id}`}
                className="border-line group flex min-w-0 flex-col gap-4 rounded-2xl border bg-white p-4 transition-colors hover:border-[#c8d6d5] focus-visible:ring-2 focus-visible:ring-[#167d73] focus-visible:outline-none sm:px-5 sm:py-4"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-ink group-hover:text-brand truncate text-base font-semibold">
                        {meeting.title}
                      </h3>
                      <MeetingStatusBadge status={meeting.status} />
                    </div>
                    <p className="text-muted mt-1 line-clamp-2 text-sm leading-5">
                      {meeting.description || "No description added."}
                    </p>
                    <p className="text-muted mt-2 text-xs">
                      {meeting.status === "scheduled"
                        ? meeting.scheduledAt
                          ? `Scheduled ${formatDateTime(meeting.scheduledAt)}`
                          : `Created ${formatDateTime(meeting.createdAt)} · start time not set`
                        : meeting.status === "active"
                          ? `Started ${formatDateTime(meeting.startedAt ?? meeting.createdAt)}`
                          : `Ended ${formatDateTime(meeting.endedAt ?? meeting.createdAt)}`}
                    </p>
                  </div>
                  <span className="text-brand hidden shrink-0 text-sm font-semibold sm:inline">
                    Open <span aria-hidden="true">→</span>
                  </span>
                </div>

                <div className="border-line flex flex-wrap items-center gap-2 border-t pt-3">
                  <Badge variant="neutral">
                    {meeting.participantCount === null
                      ? "You’re invited"
                      : `${meeting.participantCount} ${meeting.participantCount === 1 ? "invitee" : "invitees"}`}
                  </Badge>
                  <Badge variant={recordingAppearance(meeting.recordingStatus)}>
                    {recordingLabel(meeting.recordingStatus)}
                  </Badge>
                  <Badge variant={transcriptAppearance(meeting.transcriptStatus)}>
                    {transcriptLabel(meeting.transcriptStatus)}
                  </Badge>
                  <Badge variant={analysisAppearance(meeting)}>{analysisLabel(meeting)}</Badge>
                  <span className="text-muted ml-auto text-xs">
                    Duration {formatMeetingDuration(meeting)}
                  </span>
                  <span className="text-brand w-full text-sm font-semibold sm:hidden">
                    Open meeting <span aria-hidden="true">→</span>
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-line text-muted rounded-xl border border-dashed px-4 py-5 text-sm">
          No meetings in this section.
        </p>
      )}
    </section>
  );
}

function formatDateTime(value: Date) {
  return (
    new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(value) + " UTC"
  );
}

function formatMeetingDuration(meeting: MeetingHistoryRecord) {
  let seconds = meeting.recordingDurationSeconds;
  if (seconds === null && meeting.startedAt) {
    seconds = Math.max(
      0,
      Math.floor(((meeting.endedAt ?? new Date()).getTime() - meeting.startedAt.getTime()) / 1000),
    );
  }
  if (seconds === null) return "not available";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainder}s`;
  return `${remainder}s`;
}

function recordingLabel(status: MeetingHistoryRecord["recordingStatus"]) {
  if (status === "completed") return "Recording saved";
  if (status === "recording") return "Recording now";
  if (status === "processing" || status === "pending") return "Recording processing";
  if (status === "failed") return "Recording failed";
  return "No recording";
}

function recordingAppearance(status: MeetingHistoryRecord["recordingStatus"]) {
  if (status === "completed") return "success" as const;
  if (status === "recording" || status === "processing" || status === "pending") {
    return "warning" as const;
  }
  if (status === "failed") return "danger" as const;
  return "neutral" as const;
}

function transcriptLabel(status: MeetingHistoryRecord["transcriptStatus"]) {
  if (status === "completed") return "Transcript ready";
  if (status === "processing" || status === "pending") return "Transcription processing";
  if (status === "failed") return "Transcription failed";
  return "No transcript";
}

function transcriptAppearance(status: MeetingHistoryRecord["transcriptStatus"]) {
  if (status === "completed") return "success" as const;
  if (status === "processing" || status === "pending") return "warning" as const;
  if (status === "failed") return "danger" as const;
  return "neutral" as const;
}

function analysisLabel(meeting: MeetingHistoryRecord) {
  if (meeting.summaryAvailable) return "Summary available";
  if (meeting.analysisStatus === "processing" || meeting.analysisStatus === "pending") {
    return "Analysis processing";
  }
  if (meeting.analysisStatus === "failed") return "Analysis failed";
  return "No summary yet";
}

function analysisAppearance(meeting: MeetingHistoryRecord) {
  if (meeting.summaryAvailable) return "success" as const;
  if (meeting.analysisStatus === "processing" || meeting.analysisStatus === "pending") {
    return "warning" as const;
  }
  if (meeting.analysisStatus === "failed") return "danger" as const;
  return "neutral" as const;
}

function MeetingMark() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="3.5" y="5" width="12" height="14" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="m16 10 4.5-2.5v9L16 14"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
