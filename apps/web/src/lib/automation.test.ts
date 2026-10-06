import { afterEach, describe, expect, it, vi } from "vitest";

import {
  dispatchApprovedTask,
  isTaskAutomationConfigured,
  type ApprovedTaskAutomationInput,
} from "./automation";

const task: ApprovedTaskAutomationInput = {
  actionItemId: "dbe42aa0-0de6-4bdd-a84f-9fac65cd1010",
  meetingId: "39a31689-b779-4941-8345-f5f4959d2f39",
  meetingTitle: "Payment launch planning",
  title: "Prepare payment integration checklist",
  description: "List the remaining integration steps.",
  assigneeName: "Ram",
  deadline: "2026-10-08T00:00:00.000Z",
  priority: "high",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("approved task automation", () => {
  it("reports configuration only for a valid webhook and a non-empty secret", () => {
    vi.stubEnv("N8N_TASK_WEBHOOK_URL", "https://n8n.example.test/webhook/approved-task");
    vi.stubEnv("N8N_WEBHOOK_SECRET", "local-test-secret");
    expect(isTaskAutomationConfigured()).toBe(true);

    vi.stubEnv("N8N_WEBHOOK_SECRET", "  ");
    expect(isTaskAutomationConfigured()).toBe(false);

    vi.stubEnv("N8N_WEBHOOK_SECRET", "local-test-secret");
    vi.stubEnv("N8N_TASK_WEBHOOK_URL", "http://public.example.test/webhook/task");
    expect(isTaskAutomationConfigured()).toBe(false);
  });

  it("does not call n8n when the webhook is not configured", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(dispatchApprovedTask(task, { fetcher })).resolves.toEqual({
      status: "not_configured",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends only the fixed Notion task action using server-side header auth", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("Workflow got started", { status: 200 }));

    await expect(
      dispatchApprovedTask(task, {
        endpoint: "https://n8n.example.test/webhook/approved-task",
        secret: "local-test-secret",
        fetcher,
      }),
    ).resolves.toEqual({ status: "accepted", httpStatus: 200 });

    const [url, request] = fetcher.mock.calls[0] ?? [];
    expect(url).toBeInstanceOf(URL);
    expect(request?.method).toBe("POST");
    expect(new Headers(request?.headers).get("X-MeetFlow-Secret")).toBe("local-test-secret");
    expect(new Headers(request?.headers).get("Idempotency-Key")).toBe(task.actionItemId);
    expect(request?.redirect).toBe("error");
    expect(JSON.parse(String(request?.body))).toEqual({
      version: 1,
      event: "action_item.approved",
      idempotencyKey: task.actionItemId,
      action: "create_task",
      destination: "notion",
      meeting: { id: task.meetingId, title: task.meetingTitle },
      task: {
        id: task.actionItemId,
        title: task.title,
        description: task.description,
        assignee: task.assigneeName,
        deadline: task.deadline,
        priority: task.priority,
      },
    });
  });

  it("rejects malformed webhook URLs without making a request", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      dispatchApprovedTask(task, {
        endpoint: "http://public.example.test/webhook/task",
        secret: "local-test-secret",
        fetcher,
      }),
    ).resolves.toEqual({ status: "failed", errorCode: "INVALID_WEBHOOK_URL" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports rejected and unreachable n8n endpoints without exposing response details", async () => {
    const rejected = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("private failure", { status: 401 }));
    const unreachable = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("private network detail"));
    const config = {
      endpoint: "https://n8n.example.test/webhook/approved-task",
      secret: "local-test-secret",
    };

    await expect(dispatchApprovedTask(task, { ...config, fetcher: rejected })).resolves.toEqual({
      status: "failed",
      errorCode: "N8N_HTTP_ERROR",
      httpStatus: 401,
    });
    await expect(dispatchApprovedTask(task, { ...config, fetcher: unreachable })).resolves.toEqual({
      status: "failed",
      errorCode: "NETWORK_ERROR",
    });
  });
});
