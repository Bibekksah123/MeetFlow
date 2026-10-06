CREATE OR REPLACE FUNCTION public.meetflow_can_view_meeting(target_meeting_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
SET row_security = off
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.meeting_participants AS participant
    WHERE participant.meeting_id = target_meeting_id
      AND (
        (participant.user_id = auth.uid() AND participant.status = 'accepted')
        OR (
          participant.status = 'invited'
          AND participant.invitee_email IS NOT NULL
          AND lower(participant.invitee_email) = lower(current_setting('request.jwt.claim.email', true))
        )
      )
  );
$function$;--> statement-breakpoint
ALTER POLICY "meetings_select_member" ON "meetings" TO authenticated USING (
        "meetings"."owner_id" = (select auth.uid())
        OR public.meetflow_can_view_meeting("meetings"."id")
      );
