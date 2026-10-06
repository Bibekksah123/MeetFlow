import { authUid, authUsers, authenticatedRole } from "drizzle-orm/supabase";
import { sql, type SQLWrapper } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  integer,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const timestampColumn = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const meetingStatus = pgEnum("meeting_status", ["scheduled", "active", "completed"]);
export const participantStatus = pgEnum("participant_status", ["invited", "accepted", "declined"]);
export const transcriptStatus = pgEnum("transcript_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);
export const analysisStatus = pgEnum("analysis_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);
export const recordingStatus = pgEnum("recording_status", [
  "pending",
  "recording",
  "processing",
  "completed",
  "failed",
]);
export const actionItemStatus = pgEnum("action_item_status", [
  "proposed",
  "approved",
  "rejected",
  "completed",
]);
export const actionItemPriority = pgEnum("action_item_priority", ["low", "medium", "high"]);
export const automationRunStatus = pgEnum("automation_run_status", [
  "pending",
  "accepted",
  "not_configured",
  "failed",
]);

const meetingMembership = (meetingId: AnyPgColumn) =>
  sql`public.meetflow_is_meeting_member(${meetingId})`;

const meetingOwnership = (meetingId: AnyPgColumn) =>
  sql`public.meetflow_is_meeting_owner(${meetingId})`;

const invitedByEmail = (inviteeEmail: SQLWrapper) => sql`
  ${inviteeEmail} IS NOT NULL
  AND lower(${inviteeEmail}) = lower(current_setting('request.jwt.claim.email', true))
`;

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id")
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    displayName: varchar("display_name", { length: 80 }).notNull().default("MeetFlow user"),
    avatarUrl: text("avatar_url"),
    createdAt: timestampColumn("created_at").notNull().defaultNow(),
    updatedAt: timestampColumn("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check("profiles_display_name_nonempty", sql`length(btrim(${table.displayName})) > 0`),
    pgPolicy("profiles_select_own", {
      to: authenticatedRole,
      for: "select",
      using: sql`${table.id} = ${authUid}`,
    }),
    pgPolicy("profiles_update_own", {
      to: authenticatedRole,
      for: "update",
      using: sql`${table.id} = ${authUid}`,
      withCheck: sql`${table.id} = ${authUid}`,
    }),
  ],
);

export const meetings = pgTable(
  "meetings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description"),
    status: meetingStatus("status").notNull().default("scheduled"),
    scheduledAt: timestampColumn("scheduled_at"),
    startedAt: timestampColumn("started_at"),
    endedAt: timestampColumn("ended_at"),
    createdAt: timestampColumn("created_at").notNull().defaultNow(),
    updatedAt: timestampColumn("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check("meetings_title_nonempty", sql`length(btrim(${table.title})) > 0`),
    index("meetings_owner_status_idx").on(table.ownerId, table.status),
    index("meetings_scheduled_at_idx").on(table.scheduledAt),
    pgPolicy("meetings_select_member", {
      to: authenticatedRole,
      for: "select",
      using: sql`
        ${table.ownerId} = ${authUid}
        OR public.meetflow_can_view_meeting(${table.id})
      `,
    }),
    pgPolicy("meetings_insert_owner", {
      to: authenticatedRole,
      for: "insert",
      withCheck: sql`${table.ownerId} = ${authUid}`,
    }),
    pgPolicy("meetings_update_owner", {
      to: authenticatedRole,
      for: "update",
      using: sql`${table.ownerId} = ${authUid}`,
      withCheck: sql`${table.ownerId} = ${authUid}`,
    }),
    pgPolicy("meetings_delete_owner", {
      to: authenticatedRole,
      for: "delete",
      using: sql`${table.ownerId} = ${authUid}`,
    }),
  ],
);

export const meetingParticipants = pgTable(
  "meeting_participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => profiles.id, { onDelete: "cascade" }),
    inviteeEmail: varchar("invitee_email", { length: 254 }),
    invitedBy: uuid("invited_by")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    status: participantStatus("status").notNull().default("invited"),
    createdAt: timestampColumn("created_at").notNull().defaultNow(),
    updatedAt: timestampColumn("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "meeting_participants_identity_present",
      sql`${table.userId} IS NOT NULL OR ${table.inviteeEmail} IS NOT NULL`,
    ),
    uniqueIndex("meeting_participants_meeting_user_uidx").on(table.meetingId, table.userId),
    uniqueIndex("meeting_participants_meeting_email_uidx")
      .on(table.meetingId, sql`lower(${table.inviteeEmail})`)
      .where(sql`${table.inviteeEmail} IS NOT NULL`),
    index("meeting_participants_user_status_idx").on(table.userId, table.status),
    index("meeting_participants_invited_by_idx").on(table.invitedBy, table.meetingId),
    pgPolicy("meeting_participants_select_related", {
      to: authenticatedRole,
      for: "select",
      using: sql`
        ${table.userId} = ${authUid}
        OR ${table.invitedBy} = ${authUid}
        OR ${invitedByEmail(table.inviteeEmail)}
      `,
    }),
    pgPolicy("meeting_participants_insert_owner", {
      to: authenticatedRole,
      for: "insert",
      withCheck: sql`${table.invitedBy} = ${authUid} AND ${meetingOwnership(table.meetingId)}`,
    }),
    pgPolicy("meeting_participants_update_owner", {
      to: authenticatedRole,
      for: "update",
      using: sql`${table.invitedBy} = ${authUid} AND ${meetingOwnership(table.meetingId)}`,
      withCheck: sql`${table.invitedBy} = ${authUid} AND ${meetingOwnership(table.meetingId)}`,
    }),
    pgPolicy("meeting_participants_accept_invitation", {
      to: authenticatedRole,
      for: "update",
      using: sql`
        ${table.status} = 'invited'
        AND ${table.userId} IS NULL
        AND ${invitedByEmail(table.inviteeEmail)}
      `,
      withCheck: sql`
        ${table.status} = 'accepted'
        AND ${table.userId} = ${authUid}
        AND ${invitedByEmail(table.inviteeEmail)}
      `,
    }),
    pgPolicy("meeting_participants_delete_owner", {
      to: authenticatedRole,
      for: "delete",
      using: sql`${table.invitedBy} = ${authUid} AND ${meetingOwnership(table.meetingId)}`,
    }),
  ],
);

export const recordings = pgTable(
  "recordings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    egressId: varchar("egress_id", { length: 128 }),
    status: recordingStatus("status").notNull().default("pending"),
    objectKey: text("object_key"),
    durationSeconds: integer("duration_seconds"),
    errorCode: varchar("error_code", { length: 80 }),
    startedAt: timestampColumn("started_at"),
    completedAt: timestampColumn("completed_at"),
    createdAt: timestampColumn("created_at").notNull().defaultNow(),
    updatedAt: timestampColumn("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check(
      "recordings_duration_nonnegative",
      sql`${table.durationSeconds} IS NULL OR ${table.durationSeconds} >= 0`,
    ),
    uniqueIndex("recordings_egress_id_uidx")
      .on(table.egressId)
      .where(sql`${table.egressId} IS NOT NULL`),
    uniqueIndex("recordings_one_active_per_meeting_uidx")
      .on(table.meetingId)
      .where(sql`${table.status} IN ('pending', 'recording', 'processing')`),
    index("recordings_meeting_created_idx").on(table.meetingId, table.createdAt),
    pgPolicy("recordings_select_member", {
      to: authenticatedRole,
      for: "select",
      using: meetingMembership(table.meetingId),
    }),
    pgPolicy("recordings_insert_owner", {
      to: authenticatedRole,
      for: "insert",
      withCheck: meetingOwnership(table.meetingId),
    }),
    pgPolicy("recordings_update_owner", {
      to: authenticatedRole,
      for: "update",
      using: meetingOwnership(table.meetingId),
      withCheck: meetingOwnership(table.meetingId),
    }),
    pgPolicy("recordings_delete_owner", {
      to: authenticatedRole,
      for: "delete",
      using: meetingOwnership(table.meetingId),
    }),
  ],
);

export const transcripts = pgTable(
  "transcripts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    recordingId: uuid("recording_id").references(() => recordings.id, { onDelete: "cascade" }),
    attemptCount: integer("attempt_count").notNull().default(0),
    content: text("content"),
    segments: jsonb("segments").$type<TranscriptSegment[]>().notNull().default([]),
    status: transcriptStatus("status").notNull().default("pending"),
    errorMessage: text("error_message"),
    startedAt: timestampColumn("started_at"),
    completedAt: timestampColumn("completed_at"),
    createdAt: timestampColumn("created_at").notNull().defaultNow(),
    updatedAt: timestampColumn("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check("transcripts_attempt_count_range", sql`${table.attemptCount} BETWEEN 0 AND 3`),
    uniqueIndex("transcripts_meeting_uidx").on(table.meetingId),
    uniqueIndex("transcripts_recording_uidx")
      .on(table.recordingId)
      .where(sql`${table.recordingId} IS NOT NULL`),
    index("transcripts_status_idx").on(table.status),
    pgPolicy("transcripts_select_member", {
      to: authenticatedRole,
      for: "select",
      using: meetingMembership(table.meetingId),
    }),
  ],
);

export const meetingSummaries = pgTable(
  "meeting_summaries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    summary: text("summary"),
    keyPoints: jsonb("key_points").$type<string[]>().notNull().default([]),
    openQuestions: jsonb("open_questions").$type<string[]>().notNull().default([]),
    risks: jsonb("risks").$type<string[]>().notNull().default([]),
    followUp: jsonb("follow_up").$type<string[]>().notNull().default([]),
    status: analysisStatus("status").notNull().default("pending"),
    attemptCount: integer("attempt_count").notNull().default(0),
    errorMessage: text("error_message"),
    generatedAt: timestampColumn("generated_at"),
    createdAt: timestampColumn("created_at").notNull().defaultNow(),
    updatedAt: timestampColumn("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check("meeting_summaries_attempt_count_range", sql`${table.attemptCount} BETWEEN 0 AND 3`),
    uniqueIndex("meeting_summaries_meeting_uidx").on(table.meetingId),
    index("meeting_summaries_status_idx").on(table.status),
    pgPolicy("meeting_summaries_select_member", {
      to: authenticatedRole,
      for: "select",
      using: meetingMembership(table.meetingId),
    }),
  ],
);

export const decisions = pgTable(
  "decisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 180 }).notNull(),
    details: text("details"),
    sourceContext: text("source_context"),
    decidedAt: timestampColumn("decided_at"),
    createdAt: timestampColumn("created_at").notNull().defaultNow(),
    updatedAt: timestampColumn("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check("decisions_title_nonempty", sql`length(btrim(${table.title})) > 0`),
    index("decisions_meeting_created_idx").on(table.meetingId, table.createdAt),
    pgPolicy("decisions_select_member", {
      to: authenticatedRole,
      for: "select",
      using: meetingMembership(table.meetingId),
    }),
  ],
);

export const actionItems = pgTable(
  "action_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 240 }).notNull(),
    description: text("description"),
    assigneeId: uuid("assignee_id").references(() => profiles.id, { onDelete: "set null" }),
    assigneeName: varchar("assignee_name", { length: 160 }),
    deadline: timestampColumn("deadline"),
    priority: actionItemPriority("priority").notNull().default("medium"),
    status: actionItemStatus("status").notNull().default("proposed"),
    sourceContext: text("source_context"),
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    createdAt: timestampColumn("created_at").notNull().defaultNow(),
    updatedAt: timestampColumn("updated_at").notNull().defaultNow(),
  },
  (table) => [
    check("action_items_title_nonempty", sql`length(btrim(${table.title})) > 0`),
    check(
      "action_items_confidence_range",
      sql`${table.confidence} IS NULL OR (${table.confidence} >= 0 AND ${table.confidence} <= 1)`,
    ),
    index("action_items_meeting_status_idx").on(table.meetingId, table.status),
    index("action_items_assignee_status_idx").on(table.assigneeId, table.status),
    index("action_items_deadline_idx").on(table.deadline),
    pgPolicy("action_items_select_member", {
      to: authenticatedRole,
      for: "select",
      using: meetingMembership(table.meetingId),
    }),
    pgPolicy("action_items_insert_owner", {
      to: authenticatedRole,
      for: "insert",
      withCheck: meetingOwnership(table.meetingId),
    }),
    pgPolicy("action_items_update_owner", {
      to: authenticatedRole,
      for: "update",
      using: meetingOwnership(table.meetingId),
      withCheck: meetingOwnership(table.meetingId),
    }),
    pgPolicy("action_items_delete_owner", {
      to: authenticatedRole,
      for: "delete",
      using: meetingOwnership(table.meetingId),
    }),
  ],
);

/** Audit trail for user-approved external actions. Rows are retained for meeting owners. */
export const automationRuns = pgTable(
  "automation_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actionItemId: uuid("action_item_id")
      .notNull()
      .references(() => actionItems.id, { onDelete: "cascade" }),
    meetingId: uuid("meeting_id")
      .notNull()
      .references(() => meetings.id, { onDelete: "cascade" }),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 40 }).notNull(),
    destination: varchar("destination", { length: 40 }).notNull(),
    status: automationRunStatus("status").notNull().default("pending"),
    resultSummary: text("result_summary").notNull(),
    httpStatus: integer("http_status"),
    errorCode: varchar("error_code", { length: 80 }),
    createdAt: timestampColumn("created_at").notNull().defaultNow(),
    completedAt: timestampColumn("completed_at"),
  },
  (table) => [
    check("automation_runs_action_allowed", sql`${table.action} = 'create_task'`),
    check("automation_runs_destination_allowed", sql`${table.destination} = 'notion'`),
    check(
      "automation_runs_http_status_range",
      sql`${table.httpStatus} IS NULL OR ${table.httpStatus} BETWEEN 100 AND 599`,
    ),
    index("automation_runs_meeting_created_idx").on(table.meetingId, table.createdAt),
    index("automation_runs_action_item_created_idx").on(table.actionItemId, table.createdAt),
    pgPolicy("automation_runs_select_owner", {
      to: authenticatedRole,
      for: "select",
      using: sql`
        ${meetingOwnership(table.meetingId)}
        AND EXISTS (
          SELECT 1 FROM public.action_items ai
          WHERE ai.id = ${table.actionItemId} AND ai.meeting_id = ${table.meetingId}
        )
      `,
    }),
    pgPolicy("automation_runs_insert_owner", {
      to: authenticatedRole,
      for: "insert",
      withCheck: sql`
        ${table.requestedBy} = ${authUid}
        AND ${meetingOwnership(table.meetingId)}
        AND EXISTS (
          SELECT 1 FROM public.action_items ai
          WHERE ai.id = ${table.actionItemId} AND ai.meeting_id = ${table.meetingId}
        )
      `,
    }),
    pgPolicy("automation_runs_update_owner", {
      to: authenticatedRole,
      for: "update",
      using: sql`
        ${table.requestedBy} = ${authUid}
        AND ${meetingOwnership(table.meetingId)}
        AND EXISTS (
          SELECT 1 FROM public.action_items ai
          WHERE ai.id = ${table.actionItemId} AND ai.meeting_id = ${table.meetingId}
        )
      `,
      withCheck: sql`
        ${table.requestedBy} = ${authUid}
        AND ${meetingOwnership(table.meetingId)}
        AND EXISTS (
          SELECT 1 FROM public.action_items ai
          WHERE ai.id = ${table.actionItemId} AND ai.meeting_id = ${table.meetingId}
        )
      `,
    }),
  ],
);

export type TranscriptSegment = {
  startMs: number;
  endMs: number;
  text: string;
  speakerId?: string;
};

export const schema = {
  actionItems,
  automationRuns,
  decisions,
  meetingParticipants,
  meetingSummaries,
  meetings,
  profiles,
  recordings,
  transcripts,
};
