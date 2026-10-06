CREATE POLICY "meeting_participants_accept_invitation" ON "meeting_participants" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        "meeting_participants"."status" = 'invited'
        AND "meeting_participants"."user_id" IS NULL
        AND 
  "meeting_participants"."invitee_email" IS NOT NULL
  AND lower("meeting_participants"."invitee_email") = lower(current_setting('request.jwt.claim.email', true))

      ) WITH CHECK (
        "meeting_participants"."status" = 'accepted'
        AND "meeting_participants"."user_id" = (select auth.uid())
        AND 
  "meeting_participants"."invitee_email" IS NOT NULL
  AND lower("meeting_participants"."invitee_email") = lower(current_setting('request.jwt.claim.email', true))

      );--> statement-breakpoint
REVOKE UPDATE ON TABLE public.meeting_participants FROM authenticated;--> statement-breakpoint
GRANT UPDATE (user_id, status) ON TABLE public.meeting_participants TO authenticated;--> statement-breakpoint
ALTER POLICY "meeting_participants_select_related" ON "meeting_participants" TO authenticated USING (
        "meeting_participants"."user_id" = (select auth.uid())
        OR "meeting_participants"."invited_by" = (select auth.uid())
        OR 
  "meeting_participants"."invitee_email" IS NOT NULL
  AND lower("meeting_participants"."invitee_email") = lower(current_setting('request.jwt.claim.email', true))

      );--> statement-breakpoint
ALTER POLICY "meetings_select_member" ON "meetings" TO authenticated USING (
        "meetings"."owner_id" = (select auth.uid())
        OR EXISTS (
          SELECT 1
          FROM public.meeting_participants AS accessible_participant
          WHERE accessible_participant.meeting_id = "meetings"."id"
            AND (
              (
                accessible_participant.user_id = (select auth.uid())
                AND accessible_participant.status = 'accepted'
              )
              OR (
                
  accessible_participant.invitee_email IS NOT NULL
  AND lower(accessible_participant.invitee_email) = lower(current_setting('request.jwt.claim.email', true))

                AND accessible_participant.status = 'invited'
              )
            )
        )
      );
