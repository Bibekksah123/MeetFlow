import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Badge, buttonStyles, Card, ErrorState } from "@meetflow/ui";

import { MeetingStatusBadge } from "@/components/meeting-status-badge";
import { getVerifiedUserEmail, requireUser } from "@/lib/auth";
import { getDashboardActivity } from "@/lib/dashboard-data";
import { listMeetings, type MeetingHistoryRecord } from "@/lib/meetings";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  let meetings: MeetingHistoryRecord[];
  let activity: Awaited<ReturnType<typeof getDashboardActivity>>;
  try {
    const email = await getVerifiedUserEmail(user.id);
    [meetings, activity] = await Promise.all([
      listMeetings(user.id, 50, email),
      getDashboardActivity(user.id),
    ]);
  } catch {
    return (
      <ErrorState description="We could not load your dashboard. Refresh the page and try again." />
    );
  }

  const upcomingMeetings = meetings
    .filter((meeting) => meeting.status === "scheduled")
    .sort(
      (left, right) =>
        (left.scheduledAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
        (right.scheduledAt?.getTime() ?? Number.MAX_SAFE_INTEGER),
    )
    .slice(0, 4);
  const activeMeetings = meetings.filter((meeting) => meeting.status === "active").slice(0, 3);
  const recentMeetings = meetings.filter((meeting) => meeting.status !== "scheduled").slice(0, 4);
  const focusSignals = [
    activity.pendingReviewCount > 0
      ? `${activity.pendingReviewCount} ${activity.pendingReviewCount === 1 ? "task needs" : "tasks need"} review`
      : null,
    activity.dueTodayCount > 0 ? `${activity.dueTodayCount} due today` : null,
    activity.overdueCount > 0 ? `${activity.overdueCount} overdue` : null,
  ].filter((signal): signal is string => signal !== null);
  const focusMessage =
    focusSignals.length > 0
      ? focusSignals.join(" · ")
      : activity.tasks.length > 0
        ? "Your approved tasks are ready for follow-through."
        : "No tasks need your attention right now.";

  return (
    <div className="space-y-7 pb-8">
      <section className="border-line flex flex-col justify-between gap-5 border-b pb-7 sm:flex-row sm:items-end">
        <div className="max-w-2xl">
          <p className="text-brand mb-3 text-xs font-semibold tracking-[0.16em] uppercase">
            Your meeting workspace
          </p>
          <h1 className="text-ink text-3xl leading-tight font-semibold tracking-[-0.04em] sm:text-4xl">
            Welcome, {user.displayName.split(/\s+/)[0]}.
          </h1>
          <p className="text-muted mt-3 max-w-xl text-base leading-7">
            Here’s what’s coming up and what needs your attention after recent meetings.
          </p>
        </div>
        <Link
          href="/meetings/new"
          className={buttonStyles({ className: "w-full whitespace-nowrap sm:w-auto" })}
        >
          Create a meeting
        </Link>
      </section>

      <section aria-label="Quick actions" className="grid gap-3 sm:grid-cols-3">
        <QuickAction
          href="/meetings/new"
          title="Create a meeting"
          description="Set up a room and invite participants."
          primary
        />
        <QuickAction
          href={activeMeetings[0] ? `/meeting/${activeMeetings[0].id}` : "/meetings"}
          title={activeMeetings.length ? "Join active meeting" : "Find a meeting"}
          description={activeMeetings[0]?.title ?? "Open your upcoming and past rooms."}
        />
        <QuickAction
          href="/tasks"
          title="Review AI tasks"
          description="Approve, edit, or reject suggested work."
          count={activity.pendingReviewCount}
        />
      </section>

      <section
        aria-labelledby="today-focus"
        className="border-line flex flex-col gap-3 rounded-2xl border bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
      >
        <div>
          <h2 id="today-focus" className="text-ink text-sm font-semibold">
            Today’s focus
          </h2>
          <p className="text-muted mt-1 text-sm">{focusMessage}</p>
        </div>
        <Link href="/tasks" className={buttonStyles({ variant: "secondary", size: "sm" })}>
          Open tasks <span aria-hidden="true">→</span>
        </Link>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <MeetingList
          title="Upcoming meetings"
          description="The next rooms on your calendar."
          meetings={upcomingMeetings}
          empty="No upcoming meetings. Create one when you’re ready."
        />
        <MeetingList
          title="In progress"
          description="Rooms you can join now."
          meetings={activeMeetings}
          empty="No active meetings at the moment."
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <Card className="overflow-hidden">
          <SectionHeader title="Tasks to follow up" href="/tasks" action="Review tasks" />
          {activity.tasks.length > 0 ? (
            <ul className="divide-line divide-y">
              {activity.tasks.slice(0, 5).map((task) => (
                <li key={task.id}>
                  <Link
                    href={`/meeting/${task.meetingId}#action-items`}
                    className="block px-5 py-4 hover:bg-[#fafbfc] sm:px-6"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-ink text-sm font-medium">{task.title}</p>
                      <Badge variant={task.status === "proposed" ? "warning" : "brand"}>
                        {task.status === "proposed" ? "Needs review" : "Approved"}
                      </Badge>
                    </div>
                    <p className="text-muted mt-1 text-xs">
                      {task.meetingTitle} ·{" "}
                      {task.assigneeName ? `For ${task.assigneeName}` : "Unassigned"}
                      {task.deadline
                        ? ` · Due ${formatDate(new Date(task.deadline))}`
                        : " · No deadline"}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyMessage>AI-proposed and approved tasks will show here.</EmptyMessage>
          )}
        </Card>

        <Card className="overflow-hidden">
          <SectionHeader title="Recent meetings" href="/meetings" action="All meetings" />
          {recentMeetings.length > 0 ? (
            <ul className="divide-line divide-y">
              {recentMeetings.map((meeting) => (
                <li key={meeting.id}>
                  <Link
                    href={`/meeting/${meeting.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-[#fafbfc] sm:px-6"
                  >
                    <div className="min-w-0">
                      <p className="text-ink truncate text-sm font-semibold">{meeting.title}</p>
                      <p className="text-muted mt-1 text-xs">
                        {formatDate(meeting.endedAt ?? meeting.startedAt ?? meeting.createdAt)}
                      </p>
                    </div>
                    <MeetingStatusBadge status={meeting.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyMessage>Your recent meetings will appear here.</EmptyMessage>
          )}
        </Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <SectionHeader title="Recent decisions" href="/meetings" action="Browse meetings" />
          {activity.decisions.length > 0 ? (
            <ul className="divide-line divide-y">
              {activity.decisions.map((decision) => (
                <li key={decision.id}>
                  <Link
                    href={`/meeting/${decision.meetingId}#analysis`}
                    className="block px-5 py-4 hover:bg-[#fafbfc] sm:px-6"
                  >
                    <p className="text-ink text-sm font-medium">{decision.title}</p>
                    <p className="text-muted mt-1 text-xs">
                      {decision.meetingTitle} ·{" "}
                      {formatDate(new Date(decision.decidedAt ?? decision.createdAt))}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyMessage>Decisions identified in your meetings will appear here.</EmptyMessage>
          )}
        </Card>

        <Card className="overflow-hidden">
          <SectionHeader title="Automation activity" href="/tasks" action="Task history" />
          {activity.automations.length > 0 ? (
            <ul className="divide-line divide-y">
              {activity.automations.map((automation) => (
                <li key={automation.id} className="px-5 py-4 sm:px-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={automationAppearance(automation.status)}>
                      {automationLabel(automation.status)}
                    </Badge>
                    <span className="text-ink text-sm font-medium">
                      {automation.actionItemTitle}
                    </span>
                  </div>
                  <p className="text-muted mt-1 text-xs">
                    {automation.meetingTitle} · {automation.destination} ·{" "}
                    {formatDate(new Date(automation.createdAt))}
                  </p>
                  <p className="text-muted mt-2 text-xs leading-5">{automation.resultSummary}</p>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyMessage>
              When you approve an external action, its result will be tracked here.
            </EmptyMessage>
          )}
        </Card>
      </section>
    </div>
  );
}

function QuickAction({
  href,
  title,
  description,
  primary = false,
  count,
}: {
  href: string;
  title: string;
  description: string;
  primary?: boolean;
  count?: number;
}) {
  return (
    <Link
      href={href}
      className={`group flex min-h-24 items-start justify-between gap-3 rounded-2xl border px-4 py-4 transition-colors focus-visible:ring-2 focus-visible:ring-[#167d73] focus-visible:outline-none ${primary ? "border-[#176f68] bg-[#176f68] text-white hover:bg-[#125d57]" : "border-line bg-white hover:border-[#c8d6d5]"}`}
    >
      <span>
        <span
          className={`block text-sm font-semibold ${primary ? "text-white" : "text-ink group-hover:text-brand"}`}
        >
          {title}
        </span>
        <span
          className={`mt-1 block text-xs leading-5 ${primary ? "text-white/80" : "text-muted"}`}
        >
          {description}
        </span>
      </span>
      {count ? (
        <Badge variant={primary ? "neutral" : "warning"}>{count}</Badge>
      ) : (
        <span className={primary ? "text-white" : "text-brand"} aria-hidden="true">
          →
        </span>
      )}
    </Link>
  );
}

function MeetingList({
  title,
  description,
  meetings,
  empty,
}: {
  title: string;
  description: string;
  meetings: MeetingHistoryRecord[];
  empty: string;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-line flex items-start justify-between gap-4 border-b px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-ink text-base font-semibold">{title}</h2>
          <p className="text-muted mt-1 text-sm">{description}</p>
        </div>
        <Badge variant="neutral">{meetings.length}</Badge>
      </div>
      {meetings.length > 0 ? (
        <ul className="divide-line divide-y">
          {meetings.map((meeting) => (
            <li key={meeting.id}>
              <Link
                href={`/meeting/${meeting.id}`}
                className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-[#fafbfc] sm:px-6"
              >
                <div className="min-w-0">
                  <p className="text-ink truncate text-sm font-semibold">{meeting.title}</p>
                  <p className="text-muted mt-1 truncate text-xs">
                    {meeting.scheduledAt
                      ? `Scheduled ${formatDate(meeting.scheduledAt)}`
                      : meeting.description || "Time not set"}
                  </p>
                </div>
                {meeting.status === "active" ? (
                  <Badge variant="success">Join now</Badge>
                ) : (
                  <span className="text-brand text-sm" aria-hidden="true">
                    →
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyMessage>{empty}</EmptyMessage>
      )}
    </Card>
  );
}

function SectionHeader({ title, href, action }: { title: string; href: string; action: string }) {
  return (
    <div className="border-line flex items-center justify-between gap-3 border-b px-5 py-4 sm:px-6">
      <h2 className="text-ink text-base font-semibold">{title}</h2>
      <Link href={href} className={buttonStyles({ variant: "ghost", size: "sm" })}>
        {action} <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}

function EmptyMessage({ children }: { children: ReactNode }) {
  return <p className="text-muted px-5 py-7 text-sm leading-6 sm:px-6">{children}</p>;
}

function formatDate(value: Date) {
  return `${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" }).format(value)} UTC`;
}

function automationLabel(status: "pending" | "accepted" | "not_configured" | "failed") {
  if (status === "accepted") return "Accepted";
  if (status === "not_configured") return "Not configured";
  if (status === "failed") return "Failed";
  return "Pending";
}

function automationAppearance(status: "pending" | "accepted" | "not_configured" | "failed") {
  if (status === "accepted") return "success" as const;
  if (status === "not_configured") return "neutral" as const;
  if (status === "failed") return "danger" as const;
  return "warning" as const;
}
