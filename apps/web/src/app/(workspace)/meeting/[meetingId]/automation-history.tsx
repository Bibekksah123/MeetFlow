import { Badge, Card } from "@meetflow/ui";

import type { listMeetingAutomationHistory } from "@/lib/meetings";

type AutomationHistoryRows = Awaited<ReturnType<typeof listMeetingAutomationHistory>>;

export function MeetingAutomationHistory({ rows }: { rows: AutomationHistoryRows }) {
  return (
    <Card id="automation-history" className="scroll-mt-6 p-5 sm:p-6">
      <div className="mb-4">
        <h2 className="text-ink text-base font-semibold">Automation history</h2>
        <p className="text-muted mt-1 text-sm leading-5">
          Approved task requests and the response received from the automation webhook.
        </p>
      </div>
      {rows.length > 0 ? (
        <ol className="divide-line divide-y">
          {rows.map((row) => (
            <li key={row.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={statusAppearance(row.status)}>{statusLabel(row.status)}</Badge>
                <span className="text-ink text-sm font-medium">{row.actionItemTitle}</span>
              </div>
              <p className="text-muted mt-2 text-sm leading-5">{row.resultSummary}</p>
              <p className="text-muted mt-1 text-xs">
                Create task · Notion · Approved by you
                {row.httpStatus !== null ? ` · HTTP ${row.httpStatus}` : ""}
                {row.errorCode ? ` · ${row.errorCode}` : ""}
              </p>
              <time className="text-muted mt-2 block text-xs" dateTime={row.createdAt}>
                {formatTime(row.createdAt)}
              </time>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted rounded-xl bg-[#f6f8fb] px-4 py-3 text-sm">
          No approved automation requests for this meeting yet.
        </p>
      )}
    </Card>
  );
}

function statusLabel(status: AutomationHistoryRows[number]["status"]) {
  if (status === "accepted") return "Webhook accepted";
  if (status === "not_configured") return "Not configured";
  if (status === "failed") return "Failed";
  return "Pending";
}

function statusAppearance(status: AutomationHistoryRows[number]["status"]) {
  if (status === "accepted") return "success" as const;
  if (status === "not_configured") return "neutral" as const;
  if (status === "failed") return "danger" as const;
  return "warning" as const;
}

function formatTime(value: string) {
  return `${new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value))} UTC`;
}
