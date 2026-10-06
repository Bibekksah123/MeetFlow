CREATE OR REPLACE FUNCTION public.meetflow_is_meeting_owner(target_meeting_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.meetings AS meeting
    WHERE meeting.id = target_meeting_id
      AND meeting.owner_id = auth.uid()
  );
$function$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.meetflow_is_meeting_member(target_meeting_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
  SELECT public.meetflow_is_meeting_owner(target_meeting_id)
    OR EXISTS (
      SELECT 1
      FROM public.meeting_participants AS participant
      WHERE participant.meeting_id = target_meeting_id
        AND participant.user_id = auth.uid()
        AND participant.status = 'accepted'
    );
$function$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.meetflow_can_view_meeting(target_meeting_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
  SELECT public.meetflow_is_meeting_member(target_meeting_id)
    OR EXISTS (
      SELECT 1
      FROM public.meeting_participants AS participant
      WHERE participant.meeting_id = target_meeting_id
        AND participant.status = 'invited'
        AND participant.invitee_email IS NOT NULL
        AND lower(participant.invitee_email) = lower(current_setting('request.jwt.claim.email', true))
    );
$function$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.meetflow_is_meeting_owner(uuid) FROM PUBLIC, anon;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.meetflow_is_meeting_member(uuid) FROM PUBLIC, anon;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.meetflow_can_view_meeting(uuid) FROM PUBLIC, anon;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.meetflow_is_meeting_owner(uuid) TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.meetflow_is_meeting_member(uuid) TO authenticated;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.meetflow_can_view_meeting(uuid) TO authenticated;--> statement-breakpoint
ALTER POLICY "action_items_select_member" ON "action_items" TO authenticated USING (public.meetflow_is_meeting_member("action_items"."meeting_id"));--> statement-breakpoint
ALTER POLICY "action_items_insert_owner" ON "action_items" TO authenticated WITH CHECK (public.meetflow_is_meeting_owner("action_items"."meeting_id"));--> statement-breakpoint
ALTER POLICY "action_items_update_owner" ON "action_items" TO authenticated USING (public.meetflow_is_meeting_owner("action_items"."meeting_id")) WITH CHECK (public.meetflow_is_meeting_owner("action_items"."meeting_id"));--> statement-breakpoint
ALTER POLICY "action_items_delete_owner" ON "action_items" TO authenticated USING (public.meetflow_is_meeting_owner("action_items"."meeting_id"));--> statement-breakpoint
ALTER POLICY "decisions_select_member" ON "decisions" TO authenticated USING (public.meetflow_is_meeting_member("decisions"."meeting_id"));--> statement-breakpoint
ALTER POLICY "meeting_participants_insert_owner" ON "meeting_participants" TO authenticated WITH CHECK ("meeting_participants"."invited_by" = (select auth.uid()) AND public.meetflow_is_meeting_owner("meeting_participants"."meeting_id"));--> statement-breakpoint
ALTER POLICY "meeting_participants_update_owner" ON "meeting_participants" TO authenticated USING ("meeting_participants"."invited_by" = (select auth.uid()) AND public.meetflow_is_meeting_owner("meeting_participants"."meeting_id")) WITH CHECK ("meeting_participants"."invited_by" = (select auth.uid()) AND public.meetflow_is_meeting_owner("meeting_participants"."meeting_id"));--> statement-breakpoint
ALTER POLICY "meeting_participants_delete_owner" ON "meeting_participants" TO authenticated USING ("meeting_participants"."invited_by" = (select auth.uid()) AND public.meetflow_is_meeting_owner("meeting_participants"."meeting_id"));--> statement-breakpoint
ALTER POLICY "meeting_summaries_select_member" ON "meeting_summaries" TO authenticated USING (public.meetflow_is_meeting_member("meeting_summaries"."meeting_id"));--> statement-breakpoint
ALTER POLICY "meetings_select_member" ON "meetings" TO authenticated USING (public.meetflow_can_view_meeting("meetings"."id"));--> statement-breakpoint
ALTER POLICY "transcripts_select_member" ON "transcripts" TO authenticated USING (public.meetflow_is_meeting_member("transcripts"."meeting_id"));
