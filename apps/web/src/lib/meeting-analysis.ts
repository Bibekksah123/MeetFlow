import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import { actionItems, decisions, meetingSummaries, withUserDatabase } from "@meetflow/db";
import { DEVELOPMENT_SAMPLE_CONTEXT } from "@/lib/development-samples";

export type MeetingAnalysisView = {
  summary: {
    id: string;
    status: "pending" | "processing" | "completed" | "failed";
    attemptCount: number;
    summary: string | null;
    keyPoints: string[];
    openQuestions: string[];
    risks: string[];
    followUp: string[];
    errorMessage: string | null;
    generatedAt: string | null;
  };
  decisions: {
    id: string;
    title: string;
    details: string | null;
    sourceContext: string | null;
  }[];
  actionItems: {
    id: string;
    title: string;
    description: string | null;
    assigneeName: string | null;
    deadline: string | null;
    priority: "low" | "medium" | "high";
    status: "proposed" | "approved" | "rejected" | "completed";
    sourceContext: string | null;
    confidence: number | null;
  }[];
};

export async function getMeetingAnalysis(
  userId: string,
  meetingId: string,
  email?: string | null,
): Promise<MeetingAnalysisView | null> {
  return withUserDatabase(
    userId,
    async (transaction) => {
      const [summary] = await transaction
        .select({
          id: meetingSummaries.id,
          status: meetingSummaries.status,
          attemptCount: meetingSummaries.attemptCount,
          summary: meetingSummaries.summary,
          keyPoints: meetingSummaries.keyPoints,
          openQuestions: meetingSummaries.openQuestions,
          risks: meetingSummaries.risks,
          followUp: meetingSummaries.followUp,
          errorMessage: meetingSummaries.errorMessage,
          generatedAt: meetingSummaries.generatedAt,
        })
        .from(meetingSummaries)
        .where(eq(meetingSummaries.meetingId, meetingId))
        .limit(1);

      if (!summary) return null;

      const meetingDecisions = await transaction
        .select({
          id: decisions.id,
          title: decisions.title,
          details: decisions.details,
          sourceContext: decisions.sourceContext,
        })
        .from(decisions)
        .where(eq(decisions.meetingId, meetingId))
        .orderBy(asc(decisions.createdAt));

      const proposedActionItems = await transaction
        .select({
          id: actionItems.id,
          title: actionItems.title,
          description: actionItems.description,
          assigneeName: actionItems.assigneeName,
          deadline: actionItems.deadline,
          priority: actionItems.priority,
          status: actionItems.status,
          sourceContext: actionItems.sourceContext,
          confidence: actionItems.confidence,
        })
        .from(actionItems)
        .where(
          and(
            eq(actionItems.meetingId, meetingId),
            process.env.NODE_ENV === "production"
              ? sql`${actionItems.sourceContext} IS DISTINCT FROM ${DEVELOPMENT_SAMPLE_CONTEXT}`
              : undefined,
          ),
        )
        .orderBy(asc(actionItems.createdAt));

      return {
        summary: {
          ...summary,
          generatedAt: summary.generatedAt?.toISOString() ?? null,
        },
        decisions: meetingDecisions,
        actionItems: proposedActionItems.map((item) => ({
          ...item,
          deadline: item.deadline?.toISOString() ?? null,
          confidence: item.confidence === null ? null : Number(item.confidence),
        })),
      };
    },
    { email },
  );
}
