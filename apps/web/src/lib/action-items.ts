import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { actionItems, automationRuns, meetings, withUserDatabase } from "@meetflow/db";
import { DEVELOPMENT_SAMPLE_CONTEXT } from "@/lib/development-samples";

export const MAX_ACTION_ITEMS_ON_TASKS_PAGE = 200;

export type ActionItemRecord = {
  id: string;
  meetingId: string;
  meetingTitle: string;
  title: string;
  description: string | null;
  assigneeName: string | null;
  deadline: string | null;
  priority: "low" | "medium" | "high";
  status: "proposed" | "approved" | "rejected" | "completed";
  sourceContext: string | null;
  confidence: number | null;
  updatedAt: string;
  automationAttempts?: AutomationAttemptRecord[];
};

export type AutomationAttemptRecord = {
  id: string;
  requestedBy: string;
  action: string;
  destination: string;
  status: "pending" | "accepted" | "not_configured" | "failed";
  resultSummary: string;
  httpStatus: number | null;
  errorCode: string | null;
  createdAt: string;
  completedAt: string | null;
};

export async function listUserActionItems(userId: string): Promise<ActionItemRecord[]> {
  const { items, runs } = await withUserDatabase(userId, async (transaction) => {
    const items = await transaction
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
      })
      .from(actionItems)
      .innerJoin(meetings, eq(actionItems.meetingId, meetings.id))
      .where(
        and(
          eq(meetings.ownerId, userId),
          process.env.NODE_ENV === "production"
            ? sql`${actionItems.sourceContext} IS DISTINCT FROM ${DEVELOPMENT_SAMPLE_CONTEXT}`
            : undefined,
        ),
      )
      .orderBy(desc(actionItems.updatedAt))
      .limit(MAX_ACTION_ITEMS_ON_TASKS_PAGE);

    if (items.length === 0) return { items, runs: [] };

    const runs = await transaction
      .select({
        id: automationRuns.id,
        actionItemId: automationRuns.actionItemId,
        requestedBy: automationRuns.requestedBy,
        action: automationRuns.action,
        destination: automationRuns.destination,
        status: automationRuns.status,
        resultSummary: automationRuns.resultSummary,
        httpStatus: automationRuns.httpStatus,
        errorCode: automationRuns.errorCode,
        createdAt: automationRuns.createdAt,
        completedAt: automationRuns.completedAt,
      })
      .from(automationRuns)
      .innerJoin(actionItems, eq(automationRuns.actionItemId, actionItems.id))
      .innerJoin(meetings, eq(actionItems.meetingId, meetings.id))
      .where(
        and(
          eq(meetings.ownerId, userId),
          inArray(
            automationRuns.actionItemId,
            items.map((item) => item.id),
          ),
        ),
      )
      .orderBy(desc(automationRuns.createdAt))
      .limit(1_000);

    return { items, runs };
  });

  const runsByActionItem = new Map<string, AutomationAttemptRecord[]>();
  for (const run of runs) {
    const attempts = runsByActionItem.get(run.actionItemId) ?? [];
    if (attempts.length < 10) {
      attempts.push({
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
      });
      runsByActionItem.set(run.actionItemId, attempts);
    }
  }

  return items.map((item) => ({
    ...item,
    deadline: item.deadline?.toISOString() ?? null,
    confidence: item.confidence === null ? null : Number(item.confidence),
    updatedAt: item.updatedAt.toISOString(),
    automationAttempts: runsByActionItem.get(item.id) ?? [],
  }));
}
