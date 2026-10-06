import { describe, expect, it } from "vitest";

import { createMeetingSchema, meetingStatusUpdateSchema } from "./meeting-validation";

describe("meeting input validation", () => {
  it("trims meeting fields and normalizes unique invite addresses", () => {
    expect(
      createMeetingSchema.parse({
        title: "  Product kickoff  ",
        description: "  Align on the launch plan.  ",
        invitees: "RAM@example.com, ram@example.com\nlee@example.com",
      }),
    ).toEqual({
      title: "Product kickoff",
      description: "Align on the launch plan.",
      invitees: ["ram@example.com", "lee@example.com"],
    });
  });

  it("rejects an empty title and invalid invite addresses", () => {
    expect(
      createMeetingSchema.safeParse({ title: "  ", description: "", invitees: "no-at-sign" })
        .success,
    ).toBe(false);
  });

  it("rejects more than 20 invitees and invalid status transitions", () => {
    const invitees = Array.from({ length: 21 }, (_, index) => `guest${index}@example.com`).join(
      ",",
    );
    expect(
      createMeetingSchema.safeParse({ title: "Planning", description: "", invitees }).success,
    ).toBe(false);
    expect(
      meetingStatusUpdateSchema.safeParse({ meetingId: "bad", status: "scheduled" }).success,
    ).toBe(false);
  });
});
