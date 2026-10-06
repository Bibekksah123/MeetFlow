import type { Metadata } from "next";
import Link from "next/link";

import { buttonStyles, Card, ErrorState } from "@meetflow/ui";

import { getCurrentUser } from "@/lib/auth";
import { isTaskAutomationConfigured } from "@/lib/automation";
import {
  listUserActionItems,
  MAX_ACTION_ITEMS_ON_TASKS_PAGE,
  type ActionItemRecord,
} from "@/lib/action-items";

import { TaskManagement } from "./task-management";
import { SampleTaskButton } from "./sample-task-button";

export const metadata: Metadata = { title: "Tasks" };

export default async function TasksPage() {
  const user = await getCurrentUser();
  if (!user) {
    return <ErrorState description="Sign in again to view and manage your meeting tasks." />;
  }

  let actionItems: ActionItemRecord[] | null = null;
  try {
    actionItems = await listUserActionItems(user.id);
  } catch {
    // Show a safe page-level error without logging private meeting data.
  }
  if (actionItems === null) {
    return (
      <ErrorState description="We could not load your tasks. Refresh the page and try again." />
    );
  }
  const automationConfigured = isTaskAutomationConfigured();

  return (
    <div className="space-y-7">
      <div className="border-line flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-brand mb-3 text-xs font-semibold tracking-[0.16em] uppercase">
            Follow-through
          </p>
          <h1 className="text-ink text-3xl font-semibold tracking-[-0.04em]">Tasks</h1>
          <p className="text-muted mt-2 max-w-2xl text-sm leading-6">
            Review meeting suggestions, make them yours, and approve the items you want to connect
            to automation later.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {process.env.NODE_ENV === "development" ? <SampleTaskButton /> : null}
          <Link href="/meetings" className={buttonStyles({ variant: "secondary", size: "sm" })}>
            View meetings
          </Link>
        </div>
      </div>

      <Card className="px-5 py-4 sm:px-6">
        <p className="text-ink text-sm font-medium">You stay in control</p>
        <p className="text-muted mt-1 text-sm leading-5">
          {automationConfigured
            ? "Approving sends the task details through your configured n8n workflow to Notion. MeetFlow records whether n8n accepts the request; check the workflow execution to confirm the task was created."
            : "Approving records your decision in MeetFlow. No Notion task will be created until the automation webhook is configured."}
        </p>
      </Card>

      {actionItems.length > 0 ? (
        <>
          <TaskManagement initialItems={actionItems} automationConfigured={automationConfigured} />
          {actionItems.length === MAX_ACTION_ITEMS_ON_TASKS_PAGE ? (
            <p className="text-muted text-center text-xs">
              Showing the {MAX_ACTION_ITEMS_ON_TASKS_PAGE} most recently updated tasks.
            </p>
          ) : null}
        </>
      ) : (
        <Card className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
          <span
            aria-hidden="true"
            className="bg-brand-soft text-brand grid size-12 place-items-center rounded-2xl"
          >
            <TaskMark />
          </span>
          <h2 className="text-ink mt-4 text-base font-semibold">Nothing to review yet</h2>
          <p className="text-muted mt-2 max-w-md text-sm leading-6">
            Once a meeting has a completed transcript and AI analysis, suggested action items will
            appear here.
          </p>
          <Link
            href="/meetings"
            className={`mt-5 ${buttonStyles({ variant: "secondary", size: "sm" })}`}
          >
            Browse meetings
          </Link>
        </Card>
      )}
    </div>
  );
}

function TaskMark() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="m7 12.5 3.2 3.2L17.5 8M4.5 5.5h15v13h-15z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
