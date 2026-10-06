import "server-only";

import { and, asc, count, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";

import { actionItems, automationRuns, decisions, meetings, withUserDatabase } from "@meetflow/db";
import { DEVELOPMENT_SAMPLE_CONTEXT } from "@/lib/development-samples";

export type DashboardTask = {
  id: string;
  meetingId: string;
  meetingTitle: string;
  title: string;
  assigneeName: string | null;
  deadline: string | null;
  priority: "low" | "medium" | "high";
  status: "proposed" | "approved";
};

export type DashboardDecision = {
  id: string;
  meetingId: string;
  meetingTitle: string;
  title: string;
  decidedAt: string | null;
  createdAt: string;
};

export type DashboardAutomation = {
  id: string;
  meetingId: string;
  meetingTitle: string;
  actionItemTitle: string;
  status: "pending" | "accepted" | "not_configured" | "failed";
  resultSummary: string;
  destination: string;
  createdAt: string;
};

export async function getDashboardActivity(userId: string): Promise<{
  tasks: DashboardTask[];
  pendingReviewCount: number;
  dueTodayCount: number;
  overdueCount: number;
  decisions: DashboardDecision[];
  automations: DashboardAutomation[];
}> {
  return withUserDatabase(userId, async (transaction) => {
    const startOfTodayUtc = new Date();
    startOfTodayUtc.setUTCHours(0, 0, 0, 0);
    const startOfTomorrowUtc = new Date(startOfTodayUtc);
    startOfTomorrowUtc.setUTCDate(startOfTomorrowUtc.getUTCDate() + 1);
    const visibleActionItems =
      process.env.NODE_ENV === "production"
        ? sql`${actionItems.sourceContext} IS DISTINCT FROM ${DEVELOPMENT_SAMPLE_CONTEXT}`
        : undefined;
    const [tasks, pendingReviewRows, dueTodayRows, overdueRows, decisionRows, automations] =
      await Promise.all([
        transaction
          .select({
            id: actionItems.id,
            meetingId: meetings.id,
            meetingTitle: meetings.title,
            title: actionItems.title,
            assigneeName: actionItems.assigneeName,
            deadline: actionItems.deadline,
            priority: actionItems.priority,
            status: actionItems.status,
            updatedAt: actionItems.updatedAt,
          })
          .from(actionItems)
          .innerJoin(meetings, eq(actionItems.meetingId, meetings.id))
          .where(
            and(
              eq(meetings.ownerId, userId),
              inArray(actionItems.status, ["proposed", "approved"]),
              visibleActionItems,
            ),
          )
          .orderBy(asc(actionItems.deadline), desc(actionItems.updatedAt))
          .limit(6),
        transaction
          .select({ count: count() })
          .from(actionItems)
          .innerJoin(meetings, eq(actionItems.meetingId, meetings.id))
          .where(
            and(
              eq(meetings.ownerId, userId),
              eq(actionItems.status, "proposed"),
              visibleActionItems,
            ),
          ),
        transaction
          .select({ count: count() })
          .from(actionItems)
          .innerJoin(meetings, eq(actionItems.meetingId, meetings.id))
          .where(
            and(
              eq(meetings.ownerId, userId),
              inArray(actionItems.status, ["proposed", "approved"]),
              visibleActionItems,
              gte(actionItems.deadline, startOfTodayUtc),
              lt(actionItems.deadline, startOfTomorrowUtc),
            ),
          ),
        transaction
          .select({ count: count() })
          .from(actionItems)
          .innerJoin(meetings, eq(actionItems.meetingId, meetings.id))
          .where(
            and(
              eq(meetings.ownerId, userId),
              inArray(actionItems.status, ["proposed", "approved"]),
              visibleActionItems,
              lt(actionItems.deadline, startOfTodayUtc),
            ),
          ),
        transaction
          .select({
            id: decisions.id,
            meetingId: meetings.id,
            meetingTitle: meetings.title,
            title: decisions.title,
            decidedAt: decisions.decidedAt,
            createdAt: decisions.createdAt,
          })
          .from(decisions)
          .innerJoin(meetings, eq(decisions.meetingId, meetings.id))
          .where(eq(meetings.ownerId, userId))
          .orderBy(desc(decisions.createdAt))
          .limit(20),
        transaction
          .select({
            id: automationRuns.id,
            meetingId: meetings.id,
            meetingTitle: meetings.title,
            actionItemTitle: actionItems.title,
            status: automationRuns.status,
            resultSummary: automationRuns.resultSummary,
            destination: automationRuns.destination,
            createdAt: automationRuns.createdAt,
          })
          .from(automationRuns)
          .innerJoin(actionItems, eq(automationRuns.actionItemId, actionItems.id))
          .innerJoin(meetings, eq(automationRuns.meetingId, meetings.id))
          .where(and(eq(meetings.ownerId, userId), visibleActionItems))
          .orderBy(desc(automationRuns.createdAt))
          .limit(5),
      ]);

    return {
      tasks: tasks
        .filter(
          (task): task is typeof task & { status: "proposed" | "approved" } =>
            task.status === "proposed" || task.status === "approved",
        )
        .map((task) => ({
          ...task,
          deadline: task.deadline?.toISOString() ?? null,
        })),
      pendingReviewCount: pendingReviewRows[0]?.count ?? 0,
      dueTodayCount: dueTodayRows[0]?.count ?? 0,
      overdueCount: overdueRows[0]?.count ?? 0,
      decisions: decisionRows
        .sort(
          (left, right) =>
            (right.decidedAt ?? right.createdAt).getTime() -
            (left.decidedAt ?? left.createdAt).getTime(),
        )
        .slice(0, 5)
        .map((decision) => ({
          ...decision,
          decidedAt: decision.decidedAt?.toISOString() ?? null,
          createdAt: decision.createdAt.toISOString(),
        })),
      automations: automations.map((automation) => ({
        ...automation,
        createdAt: automation.createdAt.toISOString(),
      })),
    };
  });
}
