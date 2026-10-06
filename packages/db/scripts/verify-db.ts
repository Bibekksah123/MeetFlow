import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import { config as loadEnv } from "dotenv";
import { eq } from "drizzle-orm";
import postgres from "postgres";

import { closeDatabase, withUserDatabase } from "../src/database";
import { profiles } from "../src/schema";

loadEnv({ path: fileURLToPath(new URL("../../../.env.local", import.meta.url)) });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required to verify database migrations.");

const tableNames = [
  "profiles",
  "meetings",
  "recordings",
  "meeting_participants",
  "transcripts",
  "meeting_summaries",
  "decisions",
  "action_items",
  "automation_runs",
] as const;

const meetingChildTables = [
  "meeting_participants",
  "recordings",
  "transcripts",
  "meeting_summaries",
  "decisions",
  "action_items",
] as const;

const client = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 10,
  prepare: false,
});

const rollbackSignal = new Error("rollback verification fixtures");

function rowCount(value: unknown): number {
  const count = Number(value);
  if (!Number.isSafeInteger(count))
    throw new Error("Database verification returned an invalid row count.");
  return count;
}

async function verify(): Promise<void> {
  try {
    const tableSecurity = await client<
      {
        name: string;
        rls_enabled: boolean;
        policy_count: number;
      }[]
    >`
      SELECT
        relation.relname AS name,
        relation.relrowsecurity AS rls_enabled,
        count(policy.policyname)::int AS policy_count
      FROM pg_class AS relation
      JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
      LEFT JOIN pg_policies AS policy
        ON policy.schemaname = namespace.nspname AND policy.tablename = relation.relname
      WHERE namespace.nspname = 'public'
        AND relation.relname = ANY(${tableNames})
      GROUP BY relation.relname, relation.relrowsecurity
    `;

    if (
      tableSecurity.length !== tableNames.length ||
      tableSecurity.some((table) => !table.rls_enabled || rowCount(table.policy_count) === 0)
    ) {
      throw new Error("One or more application tables are missing row-level security policies.");
    }

    const grants = await client<
      {
        anonymous_meeting_read: boolean;
        authenticated_meeting_read: boolean;
        authenticated_recording_read: boolean;
        authenticated_recording_insert: boolean;
        authenticated_profile_insert: boolean;
        authenticated_participant_claim: boolean;
        authenticated_participant_email_update: boolean;
        authenticated_transcript_request: boolean;
        authenticated_analysis_request: boolean;
        authenticated_automation_runs_select: boolean;
        authenticated_automation_runs_insert: boolean;
        authenticated_automation_runs_update: boolean;
        anonymous_automation_runs_select: boolean;
        anonymous_transcript_request: boolean;
        anonymous_analysis_request: boolean;
        service_role_transcript_update: boolean;
        transcript_queue_trigger: boolean;
        service_role_bypasses_rls: boolean;
      }[]
    >`
      SELECT
        has_table_privilege('anon', 'public.meetings', 'select') AS anonymous_meeting_read,
        has_table_privilege('authenticated', 'public.meetings', 'select') AS authenticated_meeting_read,
        has_table_privilege('authenticated', 'public.recordings', 'select') AS authenticated_recording_read,
        has_table_privilege('authenticated', 'public.recordings', 'insert') AS authenticated_recording_insert,
        has_table_privilege('authenticated', 'public.profiles', 'insert') AS authenticated_profile_insert,
        has_column_privilege('authenticated', 'public.meeting_participants', 'user_id', 'update') AS authenticated_participant_claim,
        has_column_privilege('authenticated', 'public.meeting_participants', 'invitee_email', 'update') AS authenticated_participant_email_update,
        has_function_privilege('authenticated', 'public.request_meeting_transcription(uuid,uuid)', 'execute') AS authenticated_transcript_request,
        has_function_privilege('authenticated', 'public.request_meeting_analysis(uuid)', 'execute') AS authenticated_analysis_request,
        has_table_privilege('authenticated', 'public.automation_runs', 'select') AS authenticated_automation_runs_select,
        has_table_privilege('authenticated', 'public.automation_runs', 'insert') AS authenticated_automation_runs_insert,
        has_table_privilege('authenticated', 'public.automation_runs', 'update') AS authenticated_automation_runs_update,
        has_table_privilege('anon', 'public.automation_runs', 'select') AS anonymous_automation_runs_select,
        has_function_privilege('anon', 'public.request_meeting_transcription(uuid,uuid)', 'execute') AS anonymous_transcript_request,
        has_function_privilege('anon', 'public.request_meeting_analysis(uuid)', 'execute') AS anonymous_analysis_request,
        has_table_privilege('service_role', 'public.transcripts', 'update') AS service_role_transcript_update,
        EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgrelid = 'public.recordings'::regclass
            AND tgname = 'recordings_queue_transcript_update'
            AND NOT tgisinternal
        ) AS transcript_queue_trigger,
        (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role') AS service_role_bypasses_rls
    `;
    const grant = grants[0];
    if (
      !grant ||
      grant.anonymous_meeting_read ||
      !grant.authenticated_meeting_read ||
      !grant.authenticated_recording_read ||
      !grant.authenticated_recording_insert ||
      grant.authenticated_profile_insert ||
      !grant.authenticated_participant_claim ||
      grant.authenticated_participant_email_update ||
      !grant.authenticated_transcript_request ||
      !grant.authenticated_analysis_request ||
      !grant.authenticated_automation_runs_select ||
      !grant.authenticated_automation_runs_insert ||
      !grant.authenticated_automation_runs_update ||
      grant.anonymous_automation_runs_select ||
      grant.anonymous_transcript_request ||
      grant.anonymous_analysis_request ||
      !grant.service_role_transcript_update ||
      !grant.transcript_queue_trigger ||
      !grant.service_role_bypasses_rls
    ) {
      throw new Error(
        "Database grants do not match the expected private-user and worker access model.",
      );
    }

    const profileRows = await client<{ id: string }[]>`
      SELECT id FROM public.profiles ORDER BY created_at ASC LIMIT 1
    `;
    const ownerId = profileRows[0]?.id;
    if (!ownerId)
      throw new Error(
        "No auth-backed profile exists yet; sign up and confirm one test account first.",
      );

    const meetingId = randomUUID();
    const recordingId = randomUUID();
    const automationRunId = randomUUID();
    const outsiderId = randomUUID();
    const inviteeEmail = `invite-${randomUUID()}@example.invalid`;
    const testTitle = "MeetFlow database security verification";

    try {
      await client.begin(async (transaction) => {
        await transaction`
          INSERT INTO public.meetings (id, owner_id, title, status)
          VALUES (${meetingId}, ${ownerId}, ${testTitle}, 'completed')
        `;
        await transaction`
          INSERT INTO public.meeting_participants (meeting_id, invitee_email, invited_by)
          VALUES (${meetingId}, ${inviteeEmail}, ${ownerId})
        `;
        await transaction`
          INSERT INTO public.transcripts (meeting_id, content, status)
          VALUES (${meetingId}, 'temporary verification transcript', 'completed')
        `;
        await transaction`
          INSERT INTO public.meeting_summaries (meeting_id, summary, status, attempt_count)
          VALUES (${meetingId}, 'temporary verification summary', 'failed', 1)
        `;
        await transaction`
          INSERT INTO public.decisions (meeting_id, title, details)
          VALUES (${meetingId}, 'Temporary verification decision', 'Rollback-only fixture')
        `;
        const actionItemRows = await transaction<{ id: string }[]>`
          INSERT INTO public.action_items (meeting_id, title)
          VALUES (${meetingId}, 'Temporary verification action')
          RETURNING id
        `;
        const actionItemId = actionItemRows[0]?.id;
        if (!actionItemId)
          throw new Error("Could not create the action item verification fixture.");
        await transaction`
          INSERT INTO public.automation_runs (
            id, action_item_id, meeting_id, requested_by, action, destination, status,
            result_summary, http_status, completed_at
          )
          VALUES (
            ${automationRunId}, ${actionItemId}, ${meetingId}, ${ownerId},
            'create_task', 'notion', 'accepted', 'Rollback-only security fixture', 200, now()
          )
        `;
        await transaction`
          INSERT INTO public.recordings (id, meeting_id, status, object_key)
          VALUES (
            ${recordingId},
            ${meetingId},
            'completed',
            ${`meetings/${meetingId}/recordings/${recordingId}.mp4`}
          )
        `;
        await transaction`SET LOCAL ROLE authenticated`;
        await transaction`SELECT set_config('request.jwt.claim.sub', ${outsiderId}, true)`;
        await transaction`SELECT set_config('request.jwt.claim.email', ${inviteeEmail}, true)`;

        const invitedMeeting = await transaction<{ id: string }[]>`
          SELECT id FROM public.meetings WHERE id = ${meetingId}
        `;
        const visibleInvitation = await transaction<{ id: string }[]>`
          SELECT id FROM public.meeting_participants WHERE meeting_id = ${meetingId}
        `;
        if (invitedMeeting.length !== 1 || visibleInvitation.length !== 1) {
          throw new Error("An invited email cannot read its pending meeting invitation.");
        }

        await transaction`SELECT set_config('request.jwt.claim.email', 'stranger@example.invalid', true)`;

        const hiddenMeeting = await transaction<{ id: string }[]>`
          SELECT id FROM public.meetings WHERE id = ${meetingId}
        `;
        if (hiddenMeeting.length !== 0)
          throw new Error("An unrelated user can read a private meeting.");
        const hiddenInvitation = await transaction<{ id: string }[]>`
          SELECT id FROM public.meeting_participants WHERE meeting_id = ${meetingId}
        `;
        if (hiddenInvitation.length !== 0)
          throw new Error("An unrelated user can read another participant's invitation.");
        const hiddenRecording = await transaction<{ id: string }[]>`
          SELECT id FROM public.recordings WHERE meeting_id = ${meetingId}
        `;
        if (hiddenRecording.length !== 0)
          throw new Error("An unrelated user can read another meeting's recording metadata.");
        const hiddenProfile = await transaction<{ id: string }[]>`
          SELECT id FROM public.profiles WHERE id = ${ownerId}
        `;
        if (hiddenProfile.length !== 0)
          throw new Error("An unrelated user can read another user's profile.");
        const hiddenAutomationRun = await transaction<{ id: string }[]>`
          SELECT id FROM public.automation_runs WHERE id = ${automationRunId}
        `;
        if (hiddenAutomationRun.length !== 0) {
          throw new Error("An unrelated user can read another meeting's automation history.");
        }

        await transaction`SAVEPOINT verify_unauthorized_meeting_insert`;
        let insertDenied = false;
        try {
          await transaction`
            INSERT INTO public.meetings (owner_id, title)
            VALUES (${ownerId}, 'Unauthorized verification write')
          `;
        } catch (error) {
          insertDenied =
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "42501";
        }
        if (!insertDenied)
          throw new Error("The database did not reject an unauthorized meeting insert.");
        await transaction`ROLLBACK TO SAVEPOINT verify_unauthorized_meeting_insert`;

        await transaction`SAVEPOINT verify_unauthorized_automation_insert`;
        let automationInsertDenied = false;
        try {
          await transaction`
            INSERT INTO public.automation_runs (
              action_item_id, meeting_id, requested_by, action, destination, status, result_summary
            )
            VALUES (
              ${actionItemId}, ${meetingId}, ${ownerId},
              'create_task', 'notion', 'pending', 'Unauthorized verification write'
            )
          `;
        } catch (error) {
          automationInsertDenied =
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "42501";
        }
        if (!automationInsertDenied) {
          throw new Error("An unrelated user can create automation history for another meeting.");
        }
        await transaction`ROLLBACK TO SAVEPOINT verify_unauthorized_automation_insert`;

        await transaction`SELECT set_config('request.jwt.claim.sub', ${ownerId}, true)`;
        const ownedMeeting = await transaction<{ id: string }[]>`
          SELECT id FROM public.meetings WHERE id = ${meetingId}
        `;
        if (ownedMeeting.length !== 1)
          throw new Error("The meeting owner cannot read their own meeting.");
        const ownedProfile = await transaction<{ id: string }[]>`
          SELECT id FROM public.profiles WHERE id = ${ownerId}
        `;
        if (ownedProfile.length !== 1)
          throw new Error("The account owner cannot read their own profile.");
        const ownedRecording = await transaction<{ id: string }[]>`
          SELECT id FROM public.recordings WHERE meeting_id = ${meetingId}
        `;
        if (ownedRecording.length !== 1)
          throw new Error("The meeting owner cannot read their own recording metadata.");
        const ownedAutomationRun = await transaction<{ id: string }[]>`
          SELECT id FROM public.automation_runs WHERE id = ${automationRunId}
        `;
        if (ownedAutomationRun.length !== 1) {
          throw new Error("The meeting owner cannot read their own automation history.");
        }
        const createdAutomationRun = await transaction<{ id: string }[]>`
          INSERT INTO public.automation_runs (
            action_item_id, meeting_id, requested_by, action, destination, status, result_summary
          )
          VALUES (
            ${actionItemId}, ${meetingId}, ${ownerId},
            'create_task', 'notion', 'not_configured', 'No webhook is configured.'
          )
          RETURNING id
        `;
        if (!createdAutomationRun[0]?.id) {
          throw new Error("The meeting owner cannot record an automation attempt.");
        }

        const transcriptQueue = await transaction<{ status: string }[]>`
          SELECT public.request_meeting_transcription(${meetingId}, ${recordingId})::text AS status
        `;
        if (transcriptQueue[0]?.status !== "pending") {
          throw new Error("An authenticated meeting owner cannot queue a completed recording.");
        }

        await transaction`RESET ROLE`;
        await transaction`
          UPDATE public.transcripts
          SET content = 'temporary verification transcript', status = 'completed'
          WHERE meeting_id = ${meetingId}
        `;
        await transaction`SET LOCAL ROLE authenticated`;

        await transaction`SELECT set_config('request.jwt.claim.sub', ${outsiderId}, true)`;
        await transaction`SAVEPOINT verify_unauthorized_analysis_request`;
        let analysisRequestDenied = false;
        try {
          await transaction<{ status: string }[]>`
            SELECT public.request_meeting_analysis(${meetingId})::text AS status
          `;
        } catch (error) {
          analysisRequestDenied =
            typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "42501";
        }
        if (!analysisRequestDenied) {
          throw new Error("A non-owner can retry another user's meeting analysis.");
        }
        await transaction`ROLLBACK TO SAVEPOINT verify_unauthorized_analysis_request`;

        await transaction`SELECT set_config('request.jwt.claim.sub', ${ownerId}, true)`;
        const analysisQueue = await transaction<{ status: string }[]>`
          SELECT public.request_meeting_analysis(${meetingId})::text AS status
        `;
        if (analysisQueue[0]?.status !== "pending") {
          throw new Error("The meeting owner cannot retry a failed analysis.");
        }

        await transaction`RESET ROLE`;
        await transaction`
          UPDATE public.meeting_summaries
          SET status = 'failed', attempt_count = 3
          WHERE meeting_id = ${meetingId}
        `;
        await transaction`SET LOCAL ROLE authenticated`;
        const exhaustedAnalysis = await transaction<{ status: string }[]>`
          SELECT public.request_meeting_analysis(${meetingId})::text AS status
        `;
        if (exhaustedAnalysis[0]?.status !== "failed") {
          throw new Error("The meeting analysis retry limit is not enforced.");
        }

        for (const table of meetingChildTables) {
          const ownedRows = await transaction.unsafe(
            `SELECT count(*)::int AS count FROM public.${table} WHERE meeting_id = $1`,
            [meetingId],
          );
          if (rowCount(ownedRows[0]?.count) !== 1) {
            throw new Error(`The meeting owner cannot read the ${table} fixture.`);
          }
        }

        await transaction`
          INSERT INTO public.meetings (owner_id, title)
          VALUES (${ownerId}, 'MeetFlow database owner-write verification')
        `;
        const ownMeetings = await transaction<{ count: number }[]>`
          SELECT count(*)::int AS count FROM public.meetings WHERE owner_id = ${ownerId}
        `;
        if (rowCount(ownMeetings[0]?.count) < 2) {
          throw new Error(
            "The meeting owner cannot create a meeting through the authenticated role.",
          );
        }

        const createdMeeting = await transaction<{ id: string }[]>`
          INSERT INTO public.meetings (owner_id, title)
          VALUES (${ownerId}, 'MeetFlow meeting returning verification')
          RETURNING id
        `;
        const createdMeetingId = createdMeeting[0]?.id;
        if (!createdMeetingId) {
          throw new Error("An authenticated meeting insert did not return its ID.");
        }

        const createdInvitation = await transaction<{ id: string }[]>`
          INSERT INTO public.meeting_participants (meeting_id, invitee_email, invited_by)
          VALUES (
            ${createdMeetingId},
            ${`return-${randomUUID()}@example.invalid`},
            ${ownerId}
          )
          RETURNING id
        `;
        if (!createdInvitation[0]?.id) {
          throw new Error("An authenticated invitation insert did not return its ID.");
        }

        throw rollbackSignal;
      });
    } catch (error) {
      if (error !== rollbackSignal) throw error;
    }

    const rolledBack = await client<{ count: number }[]>`
      SELECT count(*)::int AS count FROM public.meetings WHERE id = ${meetingId}
    `;
    if (rowCount(rolledBack[0]?.count) !== 0) {
      throw new Error("Database security test fixtures were not rolled back.");
    }

    const ownProfile = await withUserDatabase(ownerId, (transaction) =>
      transaction.select({ id: profiles.id }).from(profiles),
    );
    if (ownProfile.length !== 1)
      throw new Error("The user-scoped database helper cannot read the account's own profile.");

    const anotherUsersProfile = await withUserDatabase(outsiderId, (transaction) =>
      transaction.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, ownerId)),
    );
    if (anotherUsersProfile.length !== 0) {
      throw new Error("The user-scoped database helper exposed a profile to an unrelated user.");
    }

    console.log(
      `Database verification passed: ${tableNames.length} tables protected; owner access and cross-user denial confirmed.`,
    );
  } finally {
    await Promise.all([client.end({ timeout: 5 }), closeDatabase()]);
  }
}

verify().catch((error: unknown) => {
  const code =
    typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
  const name = error instanceof Error ? error.name : "UnknownError";
  const message =
    error instanceof Error
      ? error.message.replace(/postgres(?:ql)?:\/\/\S+/gi, "<redacted DATABASE_URL>")
      : "The database verification did not complete.";
  console.error("Database verification failed.", { name, code, message });
  process.exitCode = 1;
});
