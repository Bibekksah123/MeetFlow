"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Badge, Button, Card, buttonStyles } from "@meetflow/ui";

import type { MeetingAnalysisView } from "@/lib/meeting-analysis";

export function MeetingAnalysisPanel({
  meetingId,
  isHost,
  recordingStatus,
  transcriptStatus,
  initialAnalysis,
}: {
  meetingId: string;
  isHost: boolean;
  recordingStatus: "pending" | "recording" | "processing" | "completed" | "failed" | null;
  transcriptStatus: "pending" | "processing" | "completed" | "failed" | null;
  initialAnalysis: MeetingAnalysisView | null;
}) {
  const [analysis, setAnalysis] = useState(initialAnalysis);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const status = analysis?.summary.status;
  const failedAnalysis = analysis?.summary.status === "failed" ? analysis : null;
  const completedAnalysis = analysis?.summary.status === "completed" ? analysis : null;

  async function retryAnalysis() {
    setRetrying(true);
    setRetryError(null);
    try {
      const response = await fetch(`/api/meetings/${meetingId}/analysis`, { method: "POST" });
      const payload = (await response.json()) as {
        analysis?: MeetingAnalysisView | null;
        error?: string;
      };
      if (!response.ok) {
        setRetryError(payload.error ?? "We could not retry this analysis. Try again.");
        return;
      }
      setAnalysis(payload.analysis ?? null);
    } catch {
      setRetryError("We could not retry this analysis. Check your connection and try again.");
    } finally {
      setRetrying(false);
    }
  }

  useEffect(() => {
    const waitingForAnalysis =
      analysis === null &&
      (transcriptStatus === "completed" ||
        (recordingStatus !== null && recordingStatus !== "failed"));
    const processing = status === "pending" || status === "processing";
    if (!waitingForAnalysis && !processing) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const refresh = async () => {
      try {
        const response = await fetch(`/api/meetings/${meetingId}/analysis`, {
          cache: "no-store",
        });
        if (response.ok) {
          const payload = (await response.json()) as { analysis: MeetingAnalysisView | null };
          if (!cancelled) setAnalysis(payload.analysis);
        }
      } catch {
        // Keep the most recent analysis status visible if the request fails.
      }

      if (!cancelled) timer = setTimeout(refresh, processing ? 4_000 : 15_000);
    };

    timer = setTimeout(refresh, processing ? 2_000 : 15_000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [analysis, meetingId, recordingStatus, status, transcriptStatus]);

  return (
    <Card id="analysis" className="scroll-mt-6 p-5 sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-ink text-base font-semibold">AI meeting analysis</h2>
          <p className="text-muted mt-1 text-sm leading-5">
            Gemini organizes the transcript into notes and suggested next steps. A host reviews each
            task before approval; if automation is configured, approval sends it to Notion.
          </p>
        </div>
        {transcriptStatus === "completed" ? (
          <Link
            href={`/meeting/${meetingId}/ask`}
            className={buttonStyles({ variant: "secondary", size: "sm" })}
          >
            Ask about this meeting
          </Link>
        ) : null}
      </div>

      {!completedAnalysis?.summary.summary ? <span id="action-items" aria-hidden="true" /> : null}

      {!analysis ? (
        <p role="status" className="text-muted rounded-xl bg-[#f6f8fb] px-4 py-3 text-sm">
          {transcriptStatus === "completed"
            ? "Analysis is queued and will appear here when it is ready."
            : "Analysis will be available after transcription completes."}
        </p>
      ) : null}

      {status === "pending" || status === "processing" ? (
        <p role="status" className="text-muted rounded-xl bg-[#f6f8fb] px-4 py-3 text-sm">
          {status === "pending"
            ? "Analysis queued. It will appear here when processing finishes."
            : "Reviewing the transcript… This can take a few minutes."}
        </p>
      ) : null}

      {failedAnalysis ? (
        <div role="status" className="rounded-xl bg-[#fff5df] px-4 py-3 text-sm text-[#76551b]">
          <p>
            {failedAnalysis.summary.errorMessage ??
              "AI analysis failed. The transcript is still available."}
          </p>
          {failedAnalysis.summary.attemptCount >= 3 ? (
            <p className="mt-1 text-xs">The three-attempt limit has been reached.</p>
          ) : isHost ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="mt-3"
              disabled={retrying}
              onClick={retryAnalysis}
            >
              {retrying ? "Queuing…" : "Retry analysis"}
            </Button>
          ) : null}
          {retryError ? <p className="mt-2 text-xs">{retryError}</p> : null}
        </div>
      ) : null}

      {completedAnalysis?.summary.summary ? (
        <div className="divide-line divide-y">
          <section className="py-4 first:pt-0">
            <h3 className="text-ink text-sm font-semibold">Summary</h3>
            <p className="text-ink mt-2 text-sm leading-6">{completedAnalysis.summary.summary}</p>
          </section>

          <AnalysisList title="Key points" items={completedAnalysis.summary.keyPoints} />

          <section className="py-4">
            <h3 className="text-ink text-sm font-semibold">Decisions</h3>
            {completedAnalysis.decisions.length > 0 ? (
              <ul className="mt-3 space-y-3">
                {completedAnalysis.decisions.map((decision) => (
                  <li key={decision.id}>
                    <p className="text-ink text-sm font-medium">{decision.title}</p>
                    {decision.details ? (
                      <p className="text-muted mt-1 text-sm leading-5">{decision.details}</p>
                    ) : null}
                    {decision.sourceContext ? <Evidence text={decision.sourceContext} /> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted mt-2 text-sm">No decisions identified.</p>
            )}
          </section>

          <section id="action-items" className="scroll-mt-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-ink text-sm font-semibold">Tasks from this meeting</h3>
              {isHost ? (
                <Link href="/tasks" className={buttonStyles({ variant: "ghost", size: "sm" })}>
                  Manage tasks
                </Link>
              ) : null}
            </div>
            {completedAnalysis.actionItems.length > 0 ? (
              <ul className="mt-3 space-y-4">
                {completedAnalysis.actionItems.map((item) => (
                  <li key={item.id} className="border-line rounded-xl border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-ink text-sm font-medium">{item.title}</p>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={actionItemStatusAppearance(item.status)}>
                          {actionItemStatusLabel(item.status)}
                        </Badge>
                        <Badge variant={item.priority === "high" ? "danger" : "neutral"}>
                          {capitalize(item.priority)} priority
                        </Badge>
                        {isDevelopmentSample(item.sourceContext) ? (
                          <Badge variant="neutral">Development sample</Badge>
                        ) : null}
                      </div>
                    </div>
                    {item.description ? (
                      <p className="text-muted mt-1 text-sm leading-5">{item.description}</p>
                    ) : null}
                    <dl className="text-muted mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
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
                          <dt className="inline font-semibold">Confidence: </dt>
                          <dd className="inline">{Math.round(item.confidence * 100)}%</dd>
                        </div>
                      ) : null}
                    </dl>
                    {item.sourceContext ? <Evidence text={item.sourceContext} /> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted mt-2 text-sm">No action items identified.</p>
            )}
          </section>

          <AnalysisList title="Open questions" items={completedAnalysis.summary.openQuestions} />
          <AnalysisList title="Risks" items={completedAnalysis.summary.risks} />
          <AnalysisList title="Suggested follow-up" items={completedAnalysis.summary.followUp} />
        </div>
      ) : null}
    </Card>
  );
}

function AnalysisList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="py-4">
      <h3 className="text-ink text-sm font-semibold">{title}</h3>
      {items.length > 0 ? (
        <ul className="text-ink mt-2 list-disc space-y-1 pl-5 text-sm leading-5">
          {items.map((item, index) => (
            <li key={`${index}-${item}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-muted mt-2 text-sm">Nothing identified.</p>
      )}
    </section>
  );
}

function Evidence({ text }: { text: string }) {
  return (
    <p className="text-muted mt-2 border-l-2 border-[#d6dee8] pl-3 text-xs leading-5">“{text}”</p>
  );
}

function isDevelopmentSample(sourceContext: string | null) {
  return sourceContext?.startsWith("MeetFlow development sample;") ?? false;
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

function actionItemStatusLabel(status: "proposed" | "approved" | "rejected" | "completed") {
  const labels = {
    proposed: "Needs review",
    approved: "Approved",
    rejected: "Rejected",
    completed: "Completed",
  };
  return labels[status];
}

function actionItemStatusAppearance(status: "proposed" | "approved" | "rejected" | "completed") {
  if (status === "proposed") return "warning" as const;
  if (status === "approved") return "brand" as const;
  if (status === "rejected") return "danger" as const;
  return "success" as const;
}
