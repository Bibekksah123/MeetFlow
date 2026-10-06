import "server-only";

import { z } from "zod";

/** The only external action MeetFlow currently allows through n8n. */
const approvedTaskSchema = z
  .object({
    actionItemId: z.uuid(),
    meetingId: z.uuid(),
    meetingTitle: z.string().trim().min(1).max(180),
    title: z.string().trim().min(1).max(240),
    description: z.string().max(4_000).nullable(),
    assigneeName: z.string().max(160).nullable(),
    deadline: z.iso.datetime({ offset: true }).nullable(),
    priority: z.enum(["low", "medium", "high"]),
  })
  .strict();

export type ApprovedTaskAutomationInput = z.infer<typeof approvedTaskSchema>;

export type AutomationDeliveryResult =
  | { status: "accepted"; httpStatus: number }
  | { status: "not_configured" }
  | {
      status: "failed";
      errorCode: "INVALID_TASK" | "INVALID_WEBHOOK_URL" | "N8N_HTTP_ERROR" | "NETWORK_ERROR";
      httpStatus?: number;
    };

/** Reports whether the server has enough valid settings to attempt the fixed Notion handoff. */
export function isTaskAutomationConfigured(): boolean {
  const endpoint = process.env.N8N_TASK_WEBHOOK_URL;
  const secret = process.env.N8N_WEBHOOK_SECRET;
  return Boolean(secret?.trim() && endpoint && parseWebhookUrl(endpoint));
}

type AutomationDependencies = {
  endpoint?: string;
  secret?: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
};

/**
 * Dispatches a fixed, validated create-task action to the configured n8n workflow.
 * The destination is fixed to Notion in the workflow; AI output never selects a tool.
 */
export async function dispatchApprovedTask(
  input: ApprovedTaskAutomationInput,
  dependencies: AutomationDependencies = {},
): Promise<AutomationDeliveryResult> {
  const endpoint = dependencies.endpoint ?? process.env.N8N_TASK_WEBHOOK_URL;
  const secret = dependencies.secret ?? process.env.N8N_WEBHOOK_SECRET;
  if (!endpoint?.trim() || !secret?.trim()) return { status: "not_configured" };

  const parsedInput = approvedTaskSchema.safeParse(input);
  if (!parsedInput.success) return { status: "failed", errorCode: "INVALID_TASK" };

  const parsedUrl = parseWebhookUrl(endpoint);
  if (!parsedUrl) return { status: "failed", errorCode: "INVALID_WEBHOOK_URL" };

  const payload = {
    version: 1,
    event: "action_item.approved",
    idempotencyKey: parsedInput.data.actionItemId,
    action: "create_task",
    destination: "notion",
    meeting: {
      id: parsedInput.data.meetingId,
      title: parsedInput.data.meetingTitle,
    },
    task: {
      id: parsedInput.data.actionItemId,
      title: parsedInput.data.title,
      description: parsedInput.data.description,
      assignee: parsedInput.data.assigneeName,
      deadline: parsedInput.data.deadline,
      priority: parsedInput.data.priority,
    },
  } as const;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), dependencies.timeoutMs ?? 10_000);
  try {
    const response = await (dependencies.fetcher ?? fetch)(parsedUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": parsedInput.data.actionItemId,
        "X-MeetFlow-Secret": secret,
      },
      body: JSON.stringify(payload),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });

    await response.body?.cancel().catch(() => undefined);
    return response.ok
      ? { status: "accepted", httpStatus: response.status }
      : { status: "failed", errorCode: "N8N_HTTP_ERROR", httpStatus: response.status };
  } catch {
    return { status: "failed", errorCode: "NETWORK_ERROR" };
  } finally {
    clearTimeout(timeout);
  }
}

function parseWebhookUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    const isHttps = url.protocol === "https:";
    const isLocalHttp =
      url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");

    if (
      (!isHttps && !isLocalHttp) ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.hash.length > 0
    ) {
      return null;
    }

    return url;
  } catch {
    return null;
  }
}
