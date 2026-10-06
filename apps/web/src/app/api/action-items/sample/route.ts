import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { actionItems, meetings, withUserDatabase } from "@meetflow/db";
import { getCurrentUser } from "@/lib/auth";
import { DEVELOPMENT_SAMPLE_CONTEXT } from "@/lib/development-samples";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAMPLE_TITLE = "Test task: Prepare the product launch checklist";
const SAMPLE_DESCRIPTION =
  "Synthetic sample task for testing the approval flow and Notion handoff. Safe to delete after testing.";

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return privateJson({ error: "Not found." }, 404);
  if (!isSameOriginRequest(request)) {
    return privateJson({ error: "This request is not allowed." }, 403);
  }

  const user = await getCurrentUser();
  if (!user) return privateJson({ error: "Sign in to add a sample task." }, 401);

  try {
    const result = await withUserDatabase(user.id, async (transaction) => {
      const [existingSample] = await transaction
        .select({ id: actionItems.id, meetingId: actionItems.meetingId })
        .from(actionItems)
        .innerJoin(meetings, eq(actionItems.meetingId, meetings.id))
        .where(
          and(
            eq(meetings.ownerId, user.id),
            eq(actionItems.title, SAMPLE_TITLE),
            eq(actionItems.description, SAMPLE_DESCRIPTION),
          ),
        )
        .limit(1);

      if (existingSample) return { kind: "ready" as const, created: false };

      const [meeting] = await transaction
        .select({ id: meetings.id })
        .from(meetings)
        .where(eq(meetings.ownerId, user.id))
        .orderBy(desc(meetings.updatedAt))
        .limit(1);

      if (!meeting) return { kind: "no_meeting" as const };

      await transaction.insert(actionItems).values({
        meetingId: meeting.id,
        title: SAMPLE_TITLE,
        description: SAMPLE_DESCRIPTION,
        assigneeName: "Sample assignee",
        priority: "medium",
        status: "proposed",
        sourceContext: DEVELOPMENT_SAMPLE_CONTEXT,
      });

      return { kind: "ready" as const, created: true };
    });

    if (result.kind === "no_meeting") {
      return privateJson(
        {
          error: "Create a meeting first; the sample task will be attached to your latest meeting.",
        },
        409,
      );
    }

    return privateJson({ created: result.created });
  } catch {
    return privateJson({ error: "We could not add a sample task. Please try again." }, 503);
  }
}

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
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
