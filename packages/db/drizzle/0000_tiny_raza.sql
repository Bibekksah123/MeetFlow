CREATE TYPE "public"."action_item_priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."action_item_status" AS ENUM('proposed', 'approved', 'rejected', 'completed');--> statement-breakpoint
CREATE TYPE "public"."analysis_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."meeting_status" AS ENUM('scheduled', 'active', 'completed');--> statement-breakpoint
CREATE TYPE "public"."participant_status" AS ENUM('invited', 'accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."transcript_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "action_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"title" varchar(240) NOT NULL,
	"description" text,
	"assignee_id" uuid,
	"assignee_name" varchar(160),
	"deadline" timestamp with time zone,
	"priority" "action_item_priority" DEFAULT 'medium' NOT NULL,
	"status" "action_item_status" DEFAULT 'proposed' NOT NULL,
	"source_context" text,
	"confidence" numeric(3, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "action_items_title_nonempty" CHECK (length(btrim("action_items"."title")) > 0),
	CONSTRAINT "action_items_confidence_range" CHECK ("action_items"."confidence" IS NULL OR ("action_items"."confidence" >= 0 AND "action_items"."confidence" <= 1))
);
--> statement-breakpoint
ALTER TABLE "action_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"title" varchar(180) NOT NULL,
	"details" text,
	"source_context" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decisions_title_nonempty" CHECK (length(btrim("decisions"."title")) > 0)
);
--> statement-breakpoint
ALTER TABLE "decisions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meeting_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"user_id" uuid,
	"invitee_email" varchar(254),
	"invited_by" uuid NOT NULL,
	"status" "participant_status" DEFAULT 'invited' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meeting_participants_identity_present" CHECK ("meeting_participants"."user_id" IS NOT NULL OR "meeting_participants"."invitee_email" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "meeting_participants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meeting_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"summary" text,
	"key_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"open_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"risks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"follow_up" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "analysis_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "meeting_summaries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" varchar(180) NOT NULL,
	"description" text,
	"status" "meeting_status" DEFAULT 'scheduled' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meetings_title_nonempty" CHECK (length(btrim("meetings"."title")) > 0)
);
--> statement-breakpoint
ALTER TABLE "meetings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" varchar(80) DEFAULT 'MeetFlow user' NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_display_name_nonempty" CHECK (length(btrim("profiles"."display_name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"content" text,
	"segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" "transcript_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transcripts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_assignee_id_profiles_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_participants" ADD CONSTRAINT "meeting_participants_invited_by_profiles_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_summaries" ADD CONSTRAINT "meeting_summaries_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meetings" ADD CONSTRAINT "meetings_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_items_meeting_status_idx" ON "action_items" USING btree ("meeting_id","status");--> statement-breakpoint
CREATE INDEX "action_items_assignee_status_idx" ON "action_items" USING btree ("assignee_id","status");--> statement-breakpoint
CREATE INDEX "action_items_deadline_idx" ON "action_items" USING btree ("deadline");--> statement-breakpoint
CREATE INDEX "decisions_meeting_created_idx" ON "decisions" USING btree ("meeting_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_participants_meeting_user_uidx" ON "meeting_participants" USING btree ("meeting_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_participants_meeting_email_uidx" ON "meeting_participants" USING btree ("meeting_id",lower("invitee_email")) WHERE "meeting_participants"."invitee_email" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "meeting_participants_user_status_idx" ON "meeting_participants" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "meeting_participants_invited_by_idx" ON "meeting_participants" USING btree ("invited_by","meeting_id");--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_summaries_meeting_uidx" ON "meeting_summaries" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "meeting_summaries_status_idx" ON "meeting_summaries" USING btree ("status");--> statement-breakpoint
CREATE INDEX "meetings_owner_status_idx" ON "meetings" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "meetings_scheduled_at_idx" ON "meetings" USING btree ("scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transcripts_meeting_uidx" ON "transcripts" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "transcripts_status_idx" ON "transcripts" USING btree ("status");--> statement-breakpoint
CREATE POLICY "action_items_select_member" ON "action_items" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
  EXISTS (
    SELECT 1
    FROM public.meetings AS accessible_meeting
    WHERE accessible_meeting.id = "action_items"."meeting_id"
      AND (
        accessible_meeting.owner_id = (select auth.uid())
        OR EXISTS (
          SELECT 1
          FROM public.meeting_participants AS accessible_participant
          WHERE accessible_participant.meeting_id = accessible_meeting.id
            AND accessible_participant.user_id = (select auth.uid())
            AND accessible_participant.status = 'accepted'
        )
      )
  )
);--> statement-breakpoint
CREATE POLICY "action_items_insert_owner" ON "action_items" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.meetings AS owned_meeting
    WHERE owned_meeting.id = "action_items"."meeting_id"
      AND owned_meeting.owner_id = (select auth.uid())
  )
);--> statement-breakpoint
CREATE POLICY "action_items_update_owner" ON "action_items" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
  EXISTS (
    SELECT 1
    FROM public.meetings AS owned_meeting
    WHERE owned_meeting.id = "action_items"."meeting_id"
      AND owned_meeting.owner_id = (select auth.uid())
  )
) WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.meetings AS owned_meeting
    WHERE owned_meeting.id = "action_items"."meeting_id"
      AND owned_meeting.owner_id = (select auth.uid())
  )
);--> statement-breakpoint
CREATE POLICY "action_items_delete_owner" ON "action_items" AS PERMISSIVE FOR DELETE TO "authenticated" USING (
  EXISTS (
    SELECT 1
    FROM public.meetings AS owned_meeting
    WHERE owned_meeting.id = "action_items"."meeting_id"
      AND owned_meeting.owner_id = (select auth.uid())
  )
);--> statement-breakpoint
CREATE POLICY "decisions_select_member" ON "decisions" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
  EXISTS (
    SELECT 1
    FROM public.meetings AS accessible_meeting
    WHERE accessible_meeting.id = "decisions"."meeting_id"
      AND (
        accessible_meeting.owner_id = (select auth.uid())
        OR EXISTS (
          SELECT 1
          FROM public.meeting_participants AS accessible_participant
          WHERE accessible_participant.meeting_id = accessible_meeting.id
            AND accessible_participant.user_id = (select auth.uid())
            AND accessible_participant.status = 'accepted'
        )
      )
  )
);--> statement-breakpoint
CREATE POLICY "meeting_participants_select_related" ON "meeting_participants" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("meeting_participants"."user_id" = (select auth.uid()) OR "meeting_participants"."invited_by" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "meeting_participants_insert_owner" ON "meeting_participants" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("meeting_participants"."invited_by" = (select auth.uid()) AND 
  EXISTS (
    SELECT 1
    FROM public.meetings AS owned_meeting
    WHERE owned_meeting.id = "meeting_participants"."meeting_id"
      AND owned_meeting.owner_id = (select auth.uid())
  )
);--> statement-breakpoint
CREATE POLICY "meeting_participants_update_owner" ON "meeting_participants" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("meeting_participants"."invited_by" = (select auth.uid()) AND 
  EXISTS (
    SELECT 1
    FROM public.meetings AS owned_meeting
    WHERE owned_meeting.id = "meeting_participants"."meeting_id"
      AND owned_meeting.owner_id = (select auth.uid())
  )
) WITH CHECK ("meeting_participants"."invited_by" = (select auth.uid()) AND 
  EXISTS (
    SELECT 1
    FROM public.meetings AS owned_meeting
    WHERE owned_meeting.id = "meeting_participants"."meeting_id"
      AND owned_meeting.owner_id = (select auth.uid())
  )
);--> statement-breakpoint
CREATE POLICY "meeting_participants_delete_owner" ON "meeting_participants" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("meeting_participants"."invited_by" = (select auth.uid()) AND 
  EXISTS (
    SELECT 1
    FROM public.meetings AS owned_meeting
    WHERE owned_meeting.id = "meeting_participants"."meeting_id"
      AND owned_meeting.owner_id = (select auth.uid())
  )
);--> statement-breakpoint
CREATE POLICY "meeting_summaries_select_member" ON "meeting_summaries" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
  EXISTS (
    SELECT 1
    FROM public.meetings AS accessible_meeting
    WHERE accessible_meeting.id = "meeting_summaries"."meeting_id"
      AND (
        accessible_meeting.owner_id = (select auth.uid())
        OR EXISTS (
          SELECT 1
          FROM public.meeting_participants AS accessible_participant
          WHERE accessible_participant.meeting_id = accessible_meeting.id
            AND accessible_participant.user_id = (select auth.uid())
            AND accessible_participant.status = 'accepted'
        )
      )
  )
);--> statement-breakpoint
CREATE POLICY "meetings_select_member" ON "meetings" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        "meetings"."owner_id" = (select auth.uid())
        OR EXISTS (
          SELECT 1
          FROM public.meeting_participants AS accessible_participant
          WHERE accessible_participant.meeting_id = "meetings"."id"
            AND accessible_participant.user_id = (select auth.uid())
            AND accessible_participant.status = 'accepted'
        )
      );--> statement-breakpoint
CREATE POLICY "meetings_insert_owner" ON "meetings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ("meetings"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "meetings_update_owner" ON "meetings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("meetings"."owner_id" = (select auth.uid())) WITH CHECK ("meetings"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "meetings_delete_owner" ON "meetings" AS PERMISSIVE FOR DELETE TO "authenticated" USING ("meetings"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "profiles_select_own" ON "profiles" AS PERMISSIVE FOR SELECT TO "authenticated" USING ("profiles"."id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "profiles_update_own" ON "profiles" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ("profiles"."id" = (select auth.uid())) WITH CHECK ("profiles"."id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "transcripts_select_member" ON "transcripts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
  EXISTS (
    SELECT 1
    FROM public.meetings AS accessible_meeting
    WHERE accessible_meeting.id = "transcripts"."meeting_id"
      AND (
        accessible_meeting.owner_id = (select auth.uid())
        OR EXISTS (
          SELECT 1
          FROM public.meeting_participants AS accessible_participant
          WHERE accessible_participant.meeting_id = accessible_meeting.id
            AND accessible_participant.user_id = (select auth.uid())
            AND accessible_participant.status = 'accepted'
        )
      )
  )
);--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.sync_profile_from_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  profile_name text;
BEGIN
  profile_name := COALESCE(
    NULLIF(LEFT(BTRIM(NEW.raw_user_meta_data ->> 'full_name'), 80), ''),
    NULLIF(LEFT(BTRIM(NEW.raw_user_meta_data ->> 'name'), 80), ''),
    NULLIF(LEFT(SPLIT_PART(COALESCE(NEW.email, ''), '@', 1), 80), ''),
    'MeetFlow user'
  );

  INSERT INTO public.profiles (id, display_name, avatar_url, created_at, updated_at)
  VALUES (
    NEW.id,
    profile_name,
    NULLIF(NEW.raw_user_meta_data ->> 'avatar_url', ''),
    COALESCE(NEW.created_at, now()),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      avatar_url = EXCLUDED.avatar_url,
      updated_at = now();

  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.sync_profile_from_auth_user() FROM PUBLIC, anon, authenticated;--> statement-breakpoint
CREATE TRIGGER meetflow_sync_profile
AFTER INSERT OR UPDATE OF email, raw_user_meta_data ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_from_auth_user();--> statement-breakpoint
INSERT INTO public.profiles (id, display_name, avatar_url, created_at, updated_at)
SELECT
  auth_user.id,
  COALESCE(
    NULLIF(LEFT(BTRIM(auth_user.raw_user_meta_data ->> 'full_name'), 80), ''),
    NULLIF(LEFT(BTRIM(auth_user.raw_user_meta_data ->> 'name'), 80), ''),
    NULLIF(LEFT(SPLIT_PART(COALESCE(auth_user.email, ''), '@', 1), 80), ''),
    'MeetFlow user'
  ),
  NULLIF(auth_user.raw_user_meta_data ->> 'avatar_url', ''),
  COALESCE(auth_user.created_at, now()),
  now()
FROM auth.users AS auth_user
ON CONFLICT (id) DO NOTHING;--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;--> statement-breakpoint
CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER meetings_set_updated_at BEFORE UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER meeting_participants_set_updated_at BEFORE UPDATE ON public.meeting_participants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER transcripts_set_updated_at BEFORE UPDATE ON public.transcripts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER meeting_summaries_set_updated_at BEFORE UPDATE ON public.meeting_summaries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER decisions_set_updated_at BEFORE UPDATE ON public.decisions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
CREATE TRIGGER action_items_set_updated_at BEFORE UPDATE ON public.action_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();--> statement-breakpoint
REVOKE ALL ON TABLE public.profiles, public.meetings, public.meeting_participants, public.transcripts, public.meeting_summaries, public.decisions, public.action_items FROM PUBLIC, anon, authenticated;--> statement-breakpoint
GRANT SELECT, UPDATE ON TABLE public.profiles TO authenticated;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.meetings, public.meeting_participants, public.action_items TO authenticated;--> statement-breakpoint
GRANT SELECT ON TABLE public.transcripts, public.meeting_summaries, public.decisions TO authenticated;--> statement-breakpoint
GRANT ALL ON TABLE public.profiles, public.meetings, public.meeting_participants, public.transcripts, public.meeting_summaries, public.decisions, public.action_items TO service_role;
