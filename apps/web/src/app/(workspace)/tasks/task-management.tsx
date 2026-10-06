"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";

import { Badge, Button, Card, buttonStyles } from "@meetflow/ui";

import type { ActionItemRecord, AutomationAttemptRecord } from "@/lib/action-items";
import type { ActionItemMutation } from "@/lib/action-item-validation";

type TaskFilter = "all" | ActionItemRecord["status"];
type EditValues = Extract<ActionItemMutation, { action: "edit" }>;

export function TaskManagement({
  initialItems,
  automationConfigured,
}: {
  initialItems: ActionItemRecord[];
  automationConfigured: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      proposed: items.filter((item) => item.status === "proposed").length,
      approved: items.filter((item) => item.status === "approved").length,
      completed: items.filter((item) => item.status === "completed").length,
      rejected: items.filter((item) => item.status === "rejected").length,
    }),
    [items],
  );
  const visibleItems = filter === "all" ? items : items.filter((item) => item.status === filter);

  async function patchTask(id: string, mutation: ActionItemMutation) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/action-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mutation),
      });
      const payload = (await response.json()) as {
        actionItem?: ActionItemRecord;
        previousStatus?: ActionItemRecord["status"];
        automation?: {
          status: "accepted" | "not_configured" | "failed";
          errorCode?: string;
        };
        automationRun?: AutomationAttemptRecord;
        error?: string;
      };
      if (!response.ok || !payload.actionItem) {
        setError(payload.error ?? "We could not update this task. Please try again.");
        return null;
      }

      const updated = payload.actionItem;
      setItems((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...updated,
                automationAttempts: payload.automationRun
                  ? [payload.automationRun, ...(item.automationAttempts ?? [])]
                  : (item.automationAttempts ?? []),
              }
            : item,
        ),
      );
      setEditingId(null);
      if (mutation.action === "approve") {
        if (payload.automation?.status === "accepted") {
          setNotice(
            "Approved and accepted by n8n. Check the workflow execution to confirm the Notion task was created.",
          );
        } else if (payload.automation?.status === "failed") {
          setNotice(
            payload.automation.errorCode === "AUTOMATION_AUDIT_UNAVAILABLE"
              ? "Approval was saved, but MeetFlow could not record the automation attempt. No task was sent. Try again after checking the server logs."
              : "Approval was saved, but n8n did not accept the task. Check the webhook settings, then edit and reapprove to try again.",
          );
        } else {
          setNotice("Approved. n8n is not configured yet, so no Notion task was sent.");
        }
      } else if (mutation.action === "reject") {
        setNotice("Task rejected. You can edit it later to review it again.");
      } else if (mutation.action === "complete") {
        setNotice("Task marked complete.");
      } else if (payload.previousStatus === "approved" || payload.previousStatus === "rejected") {
        setNotice("Changes saved. Review the task again before approving it.");
      } else {
        setNotice("Task updated.");
      }
      return updated;
    } catch {
      setError("We could not reach the task service. Check your connection and try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function deleteTask(id: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/action-items/${id}`, { method: "DELETE" });
      const payload = (await response.json()) as { deleted?: boolean; error?: string };
      if (!response.ok || !payload.deleted) {
        setError(payload.error ?? "We could not delete this task. Please try again.");
        return;
      }
      setItems((current) => current.filter((item) => item.id !== id));
      setConfirmDeleteId(null);
      setEditingId(null);
      setNotice("Task deleted.");
    } catch {
      setError("We could not reach the task service. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4" aria-label="Meeting action items">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" aria-label="Task totals">
          <Badge variant="warning">{counts.proposed} to review</Badge>
          <Badge variant="brand">{counts.approved} approved</Badge>
          <Badge variant="success">{counts.completed} complete</Badge>
          <Badge variant="danger">{counts.rejected} rejected</Badge>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <label htmlFor="task-status-filter" className="text-muted text-xs font-medium">
            Show
          </label>
          <select
            id="task-status-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value as TaskFilter)}
            className="border-line text-ink focus:border-brand focus:ring-brand min-h-10 rounded-lg border bg-white px-3 text-sm focus:ring-2 focus:outline-none"
          >
            <option value="all">All tasks ({items.length})</option>
            <option value="proposed">Needs review ({counts.proposed})</option>
            <option value="approved">Approved ({counts.approved})</option>
            <option value="completed">Completed ({counts.completed})</option>
            <option value="rejected">Rejected ({counts.rejected})</option>
          </select>
        </div>
      </div>

      {notice ? (
        <p role="status" className="rounded-lg bg-[#e9f5ed] px-4 py-3 text-sm text-[#37774f]">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg bg-[#fff5df] px-4 py-3 text-sm text-[#76551b]">
          {error}
        </p>
      ) : null}

      {visibleItems.length ? (
        <ul className="space-y-4">
          {visibleItems.map((item) => (
            <li key={item.id}>
              <TaskCard
                item={item}
                automationConfigured={automationConfigured}
                busy={busy}
                editing={editingId === item.id}
                deleting={confirmDeleteId === item.id}
                onEdit={() => {
                  setError(null);
                  setNotice(null);
                  setConfirmDeleteId(null);
                  setEditingId(editingId === item.id ? null : item.id);
                }}
                onSave={(values) => patchTask(item.id, values)}
                onStatus={(action) => patchTask(item.id, { action })}
                onRequestDelete={() => {
                  setEditingId(null);
                  setConfirmDeleteId(item.id);
                  setError(null);
                  setNotice(null);
                }}
                onCancelDelete={() => setConfirmDeleteId(null)}
                onDelete={() => deleteTask(item.id)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <Card className="px-5 py-10 text-center sm:px-6">
          <h2 className="text-ink text-sm font-semibold">
            {filter === "all" ? "No tasks here" : `No ${statusLabel(filter).toLowerCase()} tasks`}
          </h2>
          <p className="text-muted mx-auto mt-2 max-w-sm text-sm leading-6">
            {filter === "all"
              ? "Suggested action items from meetings you host will appear here."
              : "Choose another status to see more of your meeting tasks."}
          </p>
          {filter !== "all" ? (
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`${buttonStyles({ variant: "secondary", size: "sm" })} mt-4`}
            >
              Show all tasks
            </button>
          ) : null}
        </Card>
      )}
    </section>
  );
}

function TaskCard({
  item,
  automationConfigured,
  busy,
  editing,
  deleting,
  onEdit,
  onSave,
  onStatus,
  onRequestDelete,
  onCancelDelete,
  onDelete,
}: {
  item: ActionItemRecord;
  automationConfigured: boolean;
  busy: boolean;
  editing: boolean;
  deleting: boolean;
  onEdit: () => void;
  onSave: (values: EditValues) => Promise<ActionItemRecord | null>;
  onStatus: (action: "approve" | "reject" | "complete") => Promise<ActionItemRecord | null>;
  onRequestDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const canReview = item.status === "proposed";
  const canComplete = item.status === "proposed" || item.status === "approved";

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={statusAppearance(item.status)}>{statusLabel(item.status)}</Badge>
            <Badge variant={item.priority === "high" ? "danger" : "neutral"}>
              {capitalize(item.priority)} priority
            </Badge>
            {isDevelopmentSample(item.sourceContext) ? (
              <Badge variant="neutral">Development sample</Badge>
            ) : null}
          </div>
          <h2 className="text-ink mt-3 text-base leading-6 font-semibold">{item.title}</h2>
          {item.description ? (
            <p className="text-muted mt-1 text-sm leading-5">{item.description}</p>
          ) : null}
          <dl className="text-muted mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs">
            <div>
              <dt className="inline font-semibold">Assignee: </dt>
              <dd className="inline">{item.assigneeName ?? "Unassigned"}</dd>
            </div>
            <div>
              <dt className="inline font-semibold">Deadline: </dt>
              <dd className="inline">{formatDeadline(item.deadline)}</dd>
            </div>
            {item.confidence !== null ? (
              <div>
                <dt className="inline font-semibold">AI extraction confidence: </dt>
                <dd className="inline">{Math.round(item.confidence * 100)}%</dd>
              </div>
            ) : null}
          </dl>
          {item.sourceContext ? (
            <details className="text-muted mt-4 text-xs">
              <summary className="hover:text-ink w-fit cursor-pointer font-semibold">
                Meeting context
              </summary>
              <p className="mt-2 border-l-2 border-[#d6dee8] pl-3 leading-5">
                “{item.sourceContext}”
              </p>
            </details>
          ) : null}
          <Link
            href={`/meeting/${item.meetingId}`}
            className="text-brand mt-4 inline-flex min-h-8 items-center text-xs font-semibold hover:underline"
          >
            {item.meetingTitle}{" "}
            <span className="ml-1" aria-hidden="true">
              →
            </span>
          </Link>
          {item.automationAttempts && item.automationAttempts.length > 0 ? (
            <AutomationHistory attempts={item.automationAttempts} />
          ) : null}
        </div>
        {!editing && !deleting ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={onEdit}
            className="self-start"
          >
            Edit task
          </Button>
        ) : null}
      </div>

      {editing ? <TaskEditForm item={item} busy={busy} onSave={onSave} onCancel={onEdit} /> : null}

      {!editing ? (
        <div className="border-line mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
          {canReview ? (
            <>
              <Button
                type="button"
                size="sm"
                disabled={busy}
                onClick={() => void onStatus("approve")}
              >
                {automationConfigured ? "Approve & send to Notion" : "Approve task"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => void onStatus("reject")}
              >
                Reject
              </Button>
            </>
          ) : null}
          {canComplete ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => void onStatus("complete")}
            >
              Mark complete
            </Button>
          ) : null}
          {!deleting ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-[#a53d45]"
              disabled={busy}
              onClick={onRequestDelete}
            >
              Delete
            </Button>
          ) : null}
          {deleting ? (
            <div
              className="flex w-full flex-col gap-3 rounded-xl border border-[#f0c9cc] bg-[#fff7f7] p-3 sm:flex-row sm:items-center sm:justify-between"
              role="group"
              aria-label={`Confirm deletion of ${item.title}`}
            >
              <p className="text-sm text-[#7d5155]">Delete this task permanently?</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={onCancelDelete}
                >
                  Keep task
                </Button>
                <Button type="button" size="sm" variant="danger" disabled={busy} onClick={onDelete}>
                  {busy ? "Deleting…" : "Delete task"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function AutomationHistory({ attempts }: { attempts: AutomationAttemptRecord[] }) {
  return (
    <details className="border-line mt-4 border-t pt-3">
      <summary className="text-muted hover:text-ink w-fit cursor-pointer text-xs font-semibold">
        Automation history ({attempts.length})
      </summary>
      <ol className="mt-3 space-y-3">
        {attempts.slice(0, 10).map((attempt) => (
          <li key={attempt.id} className="bg-surface-muted rounded-lg px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={automationStatusAppearance(attempt.status)}>
                {automationStatusLabel(attempt.status)}
              </Badge>
              <span className="text-muted text-xs">
                {automationActionLabel(attempt.action)} ·{" "}
                {automationDestinationLabel(attempt.destination)} · Approved by you
              </span>
            </div>
            <p className="text-muted mt-2 text-xs leading-5">{attempt.resultSummary}</p>
            {attempt.httpStatus !== null ? (
              <p className="text-muted mt-1 text-xs">Webhook HTTP status: {attempt.httpStatus}</p>
            ) : null}
            {attempt.errorCode ? (
              <p className="text-muted mt-1 text-xs">Error code: {attempt.errorCode}</p>
            ) : null}
            <time className="text-muted mt-2 block text-[11px]" dateTime={attempt.createdAt}>
              {formatAutomationTime(attempt.createdAt)}
            </time>
          </li>
        ))}
      </ol>
    </details>
  );
}

function TaskEditForm({
  item,
  busy,
  onSave,
  onCancel,
}: {
  item: ActionItemRecord;
  busy: boolean;
  onSave: (values: EditValues) => Promise<ActionItemRecord | null>;
  onCancel: () => void;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onSave({
      action: "edit",
      title: String(form.get("title") ?? ""),
      description: String(form.get("description") ?? ""),
      assigneeName: String(form.get("assigneeName") ?? ""),
      deadline: String(form.get("deadline") ?? "") || null,
      priority: String(form.get("priority") ?? "medium") as EditValues["priority"],
    });
  }

  const inputClassName =
    "border-line text-ink focus:border-brand focus:ring-brand min-h-10 w-full rounded-lg border bg-white px-3 text-sm focus:ring-2 focus:outline-none";

  return (
    <form onSubmit={submit} className="border-line mt-5 space-y-4 border-t pt-5">
      <h3 className="text-ink text-sm font-semibold">Edit task details</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-ink space-y-1.5 text-xs font-medium sm:col-span-2">
          Task title
          <input
            name="title"
            required
            maxLength={240}
            defaultValue={item.title}
            className={inputClassName}
          />
        </label>
        <label className="text-ink space-y-1.5 text-xs font-medium sm:col-span-2">
          Description
          <textarea
            name="description"
            maxLength={2_000}
            rows={3}
            defaultValue={item.description ?? ""}
            className={`${inputClassName} resize-y py-2.5 leading-5`}
          />
        </label>
        <label className="text-ink space-y-1.5 text-xs font-medium">
          Assignee
          <input
            name="assigneeName"
            maxLength={160}
            placeholder="Name or leave unassigned"
            defaultValue={item.assigneeName ?? ""}
            className={inputClassName}
          />
        </label>
        <label className="text-ink space-y-1.5 text-xs font-medium">
          Deadline
          <input
            type="date"
            name="deadline"
            defaultValue={item.deadline?.slice(0, 10) ?? ""}
            className={inputClassName}
          />
        </label>
        <label className="text-ink space-y-1.5 text-xs font-medium">
          Priority
          <select name="priority" defaultValue={item.priority} className={inputClassName}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </div>
      {item.status === "approved" || item.status === "rejected" ? (
        <p className="text-muted text-xs leading-5">
          Saving changes will reopen this item for review so you can approve or reject the updated
          details.
        </p>
      ) : null}
    </form>
  );
}

function statusLabel(status: TaskFilter): string {
  const labels: Record<TaskFilter, string> = {
    all: "All",
    proposed: "Needs review",
    approved: "Approved",
    rejected: "Rejected",
    completed: "Completed",
  };
  return labels[status];
}

function isDevelopmentSample(sourceContext: string | null) {
  return sourceContext?.startsWith("MeetFlow development sample;") ?? false;
}

function statusAppearance(
  status: ActionItemRecord["status"],
): "warning" | "brand" | "danger" | "success" {
  if (status === "proposed") return "warning";
  if (status === "approved") return "brand";
  if (status === "rejected") return "danger";
  return "success";
}

function formatDeadline(value: string | null) {
  if (!value) return "Not specified";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: value.slice(11, 19) === "00:00:00" ? undefined : "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function automationStatusLabel(status: AutomationAttemptRecord["status"]) {
  const labels: Record<AutomationAttemptRecord["status"], string> = {
    pending: "Pending",
    accepted: "Accepted by n8n",
    not_configured: "Not configured",
    failed: "Failed",
  };
  return labels[status];
}

function automationStatusAppearance(
  status: AutomationAttemptRecord["status"],
): "neutral" | "brand" | "warning" | "danger" {
  if (status === "accepted") return "brand";
  if (status === "not_configured" || status === "pending") return "warning";
  return "danger";
}

function automationActionLabel(action: string) {
  return action === "create_task" ? "Create task" : "Automation action";
}

function automationDestinationLabel(destination: string) {
  return destination === "notion" ? "Notion" : "External service";
}

function formatAutomationTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}
