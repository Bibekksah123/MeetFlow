import { describe, expect, it } from "vitest";

import {
  actionItemMutationSchema,
  getNextActionItemStatus,
  type ActionItemStatus,
} from "./action-item-validation";

describe("action item validation and approval transitions", () => {
  it("trims titles and normalizes blank optional fields", () => {
    expect(
      actionItemMutationSchema.parse({
        action: "edit",
        title: "  Prepare launch notes  ",
        description: "  ",
        assigneeName: "  ",
        deadline: null,
        priority: "high",
      }),
    ).toEqual({
      action: "edit",
      title: "Prepare launch notes",
      description: null,
      assigneeName: null,
      deadline: null,
      priority: "high",
    });
  });

  it("rejects invalid titles, oversized notes, bad dates, and unrecognized fields", () => {
    const validEdit = {
      action: "edit",
      title: "Prepare launch notes",
      description: null,
      assigneeName: null,
      deadline: null,
      priority: "medium",
    };
    expect(actionItemMutationSchema.safeParse({ ...validEdit, title: " " }).success).toBe(false);
    expect(
      actionItemMutationSchema.safeParse({ ...validEdit, description: "x".repeat(2_001) }).success,
    ).toBe(false);
    expect(
      actionItemMutationSchema.safeParse({ ...validEdit, deadline: "next Thursday" }).success,
    ).toBe(false);
    expect(actionItemMutationSchema.safeParse({ action: "approve", extra: true }).success).toBe(
      false,
    );
  });

  it.each<[ActionItemStatus, "approve" | "reject" | "complete", ActionItemStatus | null]>([
    ["proposed", "approve", "approved"],
    ["proposed", "reject", "rejected"],
    ["proposed", "complete", "completed"],
    ["approved", "complete", "completed"],
    ["approved", "approve", null],
    ["rejected", "complete", null],
    ["completed", "approve", null],
  ])("moves %s by %s to %s", (current, action, expected) => {
    expect(getNextActionItemStatus(current, action)).toBe(expected);
  });

  it("reopens review when an approved or rejected task is edited", () => {
    expect(getNextActionItemStatus("approved", "edit")).toBe("proposed");
    expect(getNextActionItemStatus("rejected", "edit")).toBe("proposed");
    expect(getNextActionItemStatus("proposed", "edit")).toBe("proposed");
  });
});
