import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { actionItems, automationRuns, meetings, withUserDatabase } from "@meetflow/db";
import { getCurrentUser } from "@/lib/auth";
import {
  dispatchApprovedTask,
  type ApprovedTaskAutomationInput,
  type AutomationDeliveryResult,
} from "@/lib/automation";
import { actionItemMutationSchema, getNextActionItemStatus } from "@/lib/action-item-validation";
import type { ActionItemRecord, AutomationAttemptRecord } from "@/lib/action-items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4_096;
type RouteContext = { params: Promise<{ actionItemId: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  if (!isSameOriginRequest(request)) {
    return privateJson({ error: "This request is not allowed." }, 403);
  }
  const { actionItemId } = await params;
  if (!z.string().uuid().safeParse(actionItemId).success) {
    return privateJson({ error: "That task link is invalid." }, 400);
  }
  const user = await getCurrentUser();
  if (!user) return privateJson({ error: "Sign in to manage this task." }, 401);
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return privateJson({ error: "Send task changes as JSON." }, 415);
  }

  try {
    const body = await readRequestBody(request);
    let value: unknown;
    try {
      value = JSON.parse(body);
    } catch {
      return privateJson({ error: "The task update is invalid." }, 400);
    }
    const parsed = actionItemMutationSchema.safeParse(value);
    if (!parsed.success) {
      return privateJson({ error: "Review the task fields and try again." }, 400);
    }

    const result = await withUserDatabase(user.id, async (transaction) => {
      const [existing] = await transaction
        .select({
          id: actionItems.id,
          meetingId: actionItems.meetingId,
          meetingTitle: meetings.title,
          title: actionItems.title,
          description: actionItems.description,
          assigneeName: actionItems.assigneeName,
          deadline: actionItems.deadline,
          priority: actionItems.priority,
          status: actionItems.status,
          sourceContext: actionItems.sourceContext,
          confidence: actionItems.confidence,
          updatedAt: actionItems.updatedAt,
          updatedAtVersion: sql<string>`${actionItems.updatedAt}::text`.as("updatedAtVersion"),
        })
        .from(actionItems)
        .innerJoin(meetings, eq(actionItems.meetingId, meetings.id))
        .where(and(eq(actionItems.id, actionItemId), eq(meetings.ownerId, user.id)))
        .limit(1);

      if (!existing) return { kind: "not_found" as const };

      const nextStatus = getNextActionItemStatus(existing.status, parsed.data.action);
      if (nextStatus === null) return { kind: "conflict" as const };

      const edit = parsed.data.action === "edit" ? parsed.data : null;
      const [updated] = await transaction
        .update(actionItems)
        .set({
          ...(edit
            ? {
                title: edit.title,
                description: edit.description,
                assigneeName: edit.assigneeName,
                deadline: edit.deadline ? new Date(`${edit.deadline}T00:00:00.000Z`) : null,
                priority: edit.priority,
              }
            : {}),
          status: nextStatus,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(actionItems.id, existing.id),
            eq(actionItems.meetingId, existing.meetingId),
            eq(actionItems.status, existing.status),
            sql`${actionItems.updatedAt} = ${existing.updatedAtVersion}::timestamptz`,
          ),
        )
        .returning({
          id: actionItems.id,
          meetingId: actionItems.meetingId,
          title: actionItems.title,
          description: actionItems.description,
          assigneeName: actionItems.assigneeName,
          deadline: actionItems.deadline,
          priority: actionItems.priority,
          status: actionItems.status,
          sourceContext: actionItems.sourceContext,
          confidence: actionItems.confidence,
          updatedAt: actionItems.updatedAt,
        });

      if (!updated) return { kind: "conflict" as const };
      return {
        kind: "updated" as const,
        meetingId: existing.meetingId,
        item: toActionItemRecord(updated, existing.meetingTitle),
        previousStatus: existing.status,
      };
    });

    if (result.kind === "not_found") {
      return privateJson({ error: "Task not found." }, 404);
    }
    if (result.kind === "conflict") {
      return privateJson(
        { error: "This task has changed or can no longer use that action. Refresh and try again." },
        409,
      );
    }

    let automation:
      | AutomationDeliveryResult
      | { status: "failed"; errorCode: "AUTOMATION_AUDIT_UNAVAILABLE" }
      | undefined;
    let automationRun: AutomationAttemptRecord | undefined;
    if (parsed.data.action === "approve" && result.previousStatus === "proposed") {
      const dispatchResult = await dispatchAndRecordApprovedTask(user.id, {
        actionItemId: result.item.id,
        meetingId: result.item.meetingId,
        meetingTitle: result.item.meetingTitle,
        title: result.item.title,
        description: result.item.description,
        assigneeName: result.item.assigneeName,
        deadline: result.item.deadline,
        priority: result.item.priority,
      });
      automation = dispatchResult.delivery;
      automationRun = dispatchResult.attempt;
      if (
        automation.status === "failed" &&
        automation.errorCode !== "AUTOMATION_AUDIT_UNAVAILABLE"
      ) {
        console.warn("Approved task delivery to n8n failed.", { code: automation.errorCode });
      }
    }

    revalidatePath("/tasks");
    revalidatePath(`/meeting/${result.meetingId}`);
    revalidatePath("/dashboard");
    return privateJson({
      actionItem: result.item,
      previousStatus: result.previousStatus,
      ...(automation ? { automation } : {}),
      ...(automationRun ? { automationRun } : {}),
    });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return privateJson({ error: "The task update is too large." }, 413);
    }
    console.error("Action item update failed.", { code: safeErrorCode(error) });
    return privateJson({ error: "We could not update this task. Please try again." }, 503);
  }
}

type AuditedDeliveryResult =
  AutomationDeliveryResult | { status: "failed"; errorCode: "AUTOMATION_AUDIT_UNAVAILABLE" };

async function dispatchAndRecordApprovedTask(
  userId: string,
  input: ApprovedTaskAutomationInput,
): Promise<{ delivery: AuditedDeliveryResult; attempt?: AutomationAttemptRecord }> {
  let attemptRow: typeof automationRuns.$inferSelect;
  try {
    const [created] = await withUserDatabase(userId, (transaction) =>
      transaction
        .insert(automationRuns)
        .values({
          actionItemId: input.actionItemId,
          meetingId: input.meetingId,
          requestedBy: userId,
          action: "create_task",
          destination: "notion",
          status: "pending",
          resultSummary: "Waiting for the n8n webhook response.",
        })
        .returning(),
    );
    if (!created) throw new Error("Automation audit row was not returned.");
    attemptRow = created;
  } catch (error) {
    console.error("Automation audit record could not be created; task was not sent.", {
      code: safeErrorCode(error),
    });
    return { delivery: { status: "failed", errorCode: "AUTOMATION_AUDIT_UNAVAILABLE" } };
  }

  let delivery: AutomationDeliveryResult;
  try {
    delivery = await dispatchApprovedTask(input);
  } catch {
    delivery = { status: "failed", errorCode: "NETWORK_ERROR" };
  }

  const resultSummary = automationResultSummary(delivery);
  try {
    const [updated] = await withUserDatabase(userId, (transaction) =>
      transaction
        .update(automationRuns)
        .set({
          status: delivery.status,
          resultSummary,
          httpStatus: "httpStatus" in delivery ? (delivery.httpStatus ?? null) : null,
          errorCode: delivery.status === "failed" ? delivery.errorCode : null,
          completedAt: new Date(),
        })
        .where(
          and(
            eq(automationRuns.id, attemptRow.id),
            eq(automationRuns.status, "pending"),
            eq(automationRuns.requestedBy, userId),
          ),
        )
        .returning(),
    );
    if (updated) attemptRow = updated;
    else console.warn("Automation audit record remained pending after dispatch.");
  } catch (error) {
    console.error("Automation audit record could not be finalized.", {
      code: safeErrorCode(error),
    });
  }

  return { delivery, attempt: toAutomationAttemptRecord(attemptRow) };
}

function automationResultSummary(result: AutomationDeliveryResult): string {
  if (result.status === "accepted") {
    return "n8n accepted the request. Check its execution history to confirm the Notion task was created.";
  }
  if (result.status === "not_configured") {
    return "n8n is not configured. No external task was created.";
  }
  return "n8n did not accept the request. See the error code and server logs for troubleshooting.";
}

function toAutomationAttemptRecord(
  run: typeof automationRuns.$inferSelect,
): AutomationAttemptRecord {
  return {
    id: run.id,
    requestedBy: run.requestedBy,
    action: run.action,
    destination: run.destination,
    status: run.status,
    resultSummary: run.resultSummary,
    httpStatus: run.httpStatus,
    errorCode: run.errorCode,
    createdAt: run.createdAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
  };
}

export async function DELETE(request: Request, { params }: RouteContext) {
  if (!isSameOriginRequest(request)) {
    return privateJson({ error: "This request is not allowed." }, 403);
  }
  const { actionItemId } = await params;
  if (!z.string().uuid().safeParse(actionItemId).success) {
    return privateJson({ error: "That task link is invalid." }, 400);
  }
  const user = await getCurrentUser();
  if (!user) return privateJson({ error: "Sign in to manage this task." }, 401);

  try {
    const result = await withUserDatabase(user.id, async (transaction) => {
      const [existing] = await transaction
        .select({
          id: actionItems.id,
          meetingId: actionItems.meetingId,
          updatedAtVersion: sql<string>`${actionItems.updatedAt}::text`.as("updatedAtVersion"),
        })
        .from(actionItems)
        .innerJoin(meetings, eq(actionItems.meetingId, meetings.id))
        .where(and(eq(actionItems.id, actionItemId), eq(meetings.ownerId, user.id)))
        .limit(1);
      if (!existing) return { kind: "not_found" as const };

      const [deleted] = await transaction
        .delete(actionItems)
        .where(
          and(
            eq(actionItems.id, existing.id),
            eq(actionItems.meetingId, existing.meetingId),
            sql`${actionItems.updatedAt} = ${existing.updatedAtVersion}::timestamptz`,
          ),
        )
        .returning({ id: actionItems.id });
      return deleted
        ? { kind: "deleted" as const, meetingId: existing.meetingId }
        : { kind: "conflict" as const };
    });

    if (result.kind === "not_found") return privateJson({ error: "Task not found." }, 404);
    if (result.kind === "conflict") {
      return privateJson(
        { error: "This task changed before it could be deleted. Refresh and try again." },
        409,
      );
    }

    revalidatePath("/tasks");
    revalidatePath(`/meeting/${result.meetingId}`);
    revalidatePath("/dashboard");
    return privateJson({ deleted: true });
  } catch (error) {
    console.error("Action item deletion failed.", { code: safeErrorCode(error) });
    return privateJson({ error: "We could not delete this task. Please try again." }, 503);
  }
}

type ActionItemRow = {
  id: string;
  meetingId: string;
  title: string;
  description: string | null;
  assigneeName: string | null;
  deadline: Date | null;
  priority: ActionItemRecord["priority"];
  status: ActionItemRecord["status"];
  sourceContext: string | null;
  confidence: string | null;
  updatedAt: Date;
};

function toActionItemRecord(item: ActionItemRow, meetingTitle: string): ActionItemRecord {
  return {
    ...item,
    meetingTitle,
    deadline: item.deadline?.toISOString() ?? null,
    confidence: item.confidence === null ? null : Number(item.confidence),
    updatedAt: item.updatedAt.toISOString(),
  };
}

class RequestBodyTooLargeError extends Error {}

async function readRequestBody(request: Request): Promise<string> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new RequestBodyTooLargeError();
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let byteLength = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }
      body += decoder.decode(value, { stream: true });
    }
    return body + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
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
