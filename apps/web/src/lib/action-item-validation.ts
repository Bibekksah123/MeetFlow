import { z } from "zod";

export const actionItemStatuses = ["proposed", "approved", "rejected", "completed"] as const;
export type ActionItemStatus = (typeof actionItemStatuses)[number];

const editActionItemSchema = z
  .object({
    action: z.literal("edit"),
    title: z.string().trim().min(1, "Enter a task title.").max(240),
    description: z
      .string()
      .trim()
      .max(2_000)
      .transform((value) => value || null)
      .nullable(),
    assigneeName: z
      .string()
      .trim()
      .max(160)
      .transform((value) => value || null)
      .nullable(),
    deadline: z.iso.date().nullable(),
    priority: z.enum(["low", "medium", "high"]),
  })
  .strict();

export const actionItemMutationSchema = z.discriminatedUnion("action", [
  editActionItemSchema,
  z.object({ action: z.literal("approve") }).strict(),
  z.object({ action: z.literal("reject") }).strict(),
  z.object({ action: z.literal("complete") }).strict(),
]);

export type ActionItemMutation = z.infer<typeof actionItemMutationSchema>;

/** Editing a reviewed task reopens review; changed details must be reviewed again. */
export function getNextActionItemStatus(
  currentStatus: ActionItemStatus,
  action: ActionItemMutation["action"],
): ActionItemStatus | null {
  if (action === "edit") {
    return currentStatus === "approved" || currentStatus === "rejected"
      ? "proposed"
      : currentStatus;
  }
  if (action === "approve") return currentStatus === "proposed" ? "approved" : null;
  if (action === "reject") return currentStatus === "proposed" ? "rejected" : null;
  if (action === "complete") {
    return currentStatus === "proposed" || currentStatus === "approved" ? "completed" : null;
  }
  return null;
}
