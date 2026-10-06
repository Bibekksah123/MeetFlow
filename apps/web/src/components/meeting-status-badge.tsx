import { Badge } from "@meetflow/ui";

export type MeetingStatusValue = "scheduled" | "active" | "completed";

const appearances = {
  scheduled: { label: "Scheduled", variant: "neutral" as const },
  active: { label: "Active", variant: "success" as const },
  completed: { label: "Completed", variant: "brand" as const },
};

export function MeetingStatusBadge({ status }: { status: MeetingStatusValue }) {
  const appearance = appearances[status];
  return <Badge variant={appearance.variant}>{appearance.label}</Badge>;
}
