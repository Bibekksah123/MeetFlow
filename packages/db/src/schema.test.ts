import { describe, expect, it } from "vitest";
import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";

import { withUserDatabase } from "./database";
import {
  actionItemPriority,
  actionItemStatus,
  actionItems,
  automationRunStatus,
  automationRuns,
  decisions,
  meetingParticipants,
  meetingSummaries,
  meetings,
  profiles,
  recordings,
  recordingStatus,
  transcripts,
} from "./schema";

const phaseThreeTables = [
  profiles,
  meetings,
  recordings,
  meetingParticipants,
  transcripts,
  meetingSummaries,
  decisions,
  actionItems,
];

describe("Phase 3 database schema", () => {
  it("rejects non-UUID identities before opening a database connection", async () => {
    await expect(withUserDatabase("not-a-user-id", async () => null)).rejects.toThrow(
      "A valid authenticated user ID is required.",
    );
  });

  it("contains the planned profile and meeting-analysis tables", () => {
    expect(phaseThreeTables.map(getTableName)).toEqual([
      "profiles",
      "meetings",
      "recordings",
      "meeting_participants",
      "transcripts",
      "meeting_summaries",
      "decisions",
      "action_items",
    ]);
  });

  it("enables row-level policies on every private application table", () => {
    for (const table of phaseThreeTables) {
      expect(
        getTableConfig(table).policies.length,
        `${getTableName(table)} has RLS policies`,
      ).toBeGreaterThan(0);
    }
  });

  it("allows invite acceptance only through an email-scoped participant policy", () => {
    expect(getTableConfig(meetingParticipants).policies.map((policy) => policy.name)).toContain(
      "meeting_participants_accept_invitation",
    );
  });

  it("keeps task and meeting relationships indexed and constrained", () => {
    expect(getTableConfig(actionItems).columns.map((column) => column.name)).toContain(
      "meeting_id",
    );
    expect(actionItemStatus.enumValues).toEqual(["proposed", "approved", "rejected", "completed"]);
    expect(actionItemPriority.enumValues).toEqual(["low", "medium", "high"]);
    expect(getTableConfig(meetings).foreignKeys).toHaveLength(1);
    expect(getTableConfig(meetingParticipants).foreignKeys).toHaveLength(3);
    expect(getTableConfig(transcripts).indexes.some((index) => index.config.unique)).toBe(true);
    expect(getTableConfig(transcripts).foreignKeys).toHaveLength(2);
    expect(getTableConfig(transcripts).columns.map((column) => column.name)).toContain(
      "attempt_count",
    );
    expect(getTableConfig(meetingSummaries).columns.map((column) => column.name)).toContain(
      "attempt_count",
    );
    expect(getTableConfig(meetingSummaries).checks.map((check) => check.name)).toContain(
      "meeting_summaries_attempt_count_range",
    );
    expect(getTableConfig(recordings).foreignKeys).toHaveLength(1);
    expect(getTableConfig(recordings).indexes.some((index) => index.config.unique)).toBe(true);
    expect(recordingStatus.enumValues).toEqual([
      "pending",
      "recording",
      "processing",
      "completed",
      "failed",
    ]);
  });

  it("stores owner-scoped automation audit records", () => {
    const config = getTableConfig(automationRuns);
    expect(getTableName(automationRuns)).toBe("automation_runs");
    expect(automationRunStatus.enumValues).toEqual([
      "pending",
      "accepted",
      "not_configured",
      "failed",
    ]);
    expect(config.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "action_item_id",
        "meeting_id",
        "requested_by",
        "action",
        "destination",
        "status",
        "result_summary",
        "http_status",
        "error_code",
        "created_at",
        "completed_at",
      ]),
    );
    expect(config.policies.map((policy) => policy.name)).toEqual(
      expect.arrayContaining([
        "automation_runs_select_owner",
        "automation_runs_insert_owner",
        "automation_runs_update_owner",
      ]),
    );
  });
});
