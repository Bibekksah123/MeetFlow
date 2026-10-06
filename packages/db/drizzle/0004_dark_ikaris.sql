CREATE TYPE "public"."recording_status" AS ENUM('pending', 'recording', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "recordings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meeting_id" uuid NOT NULL,
	"egress_id" varchar(128),
	"status" "recording_status" DEFAULT 'pending' NOT NULL,
	"object_key" text,
	"duration_seconds" integer,
	"error_code" varchar(80),
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recordings_duration_nonnegative" CHECK ("recordings"."duration_seconds" IS NULL OR "recordings"."duration_seconds" >= 0)
);
--> statement-breakpoint
ALTER TABLE "recordings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "recordings" ADD CONSTRAINT "recordings_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "recordings_egress_id_uidx" ON "recordings" USING btree ("egress_id") WHERE "recordings"."egress_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "recordings_one_active_per_meeting_uidx" ON "recordings" USING btree ("meeting_id") WHERE "recordings"."status" IN ('pending', 'recording', 'processing');--> statement-breakpoint
CREATE INDEX "recordings_meeting_created_idx" ON "recordings" USING btree ("meeting_id","created_at");--> statement-breakpoint
CREATE POLICY "recordings_select_member" ON "recordings" AS PERMISSIVE FOR SELECT TO "authenticated" USING (public.meetflow_is_meeting_member("recordings"."meeting_id"));--> statement-breakpoint
CREATE POLICY "recordings_insert_owner" ON "recordings" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (public.meetflow_is_meeting_owner("recordings"."meeting_id"));--> statement-breakpoint
CREATE POLICY "recordings_update_owner" ON "recordings" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (public.meetflow_is_meeting_owner("recordings"."meeting_id")) WITH CHECK (public.meetflow_is_meeting_owner("recordings"."meeting_id"));--> statement-breakpoint
CREATE POLICY "recordings_delete_owner" ON "recordings" AS PERMISSIVE FOR DELETE TO "authenticated" USING (public.meetflow_is_meeting_owner("recordings"."meeting_id"));
--> statement-breakpoint
CREATE TRIGGER recordings_set_updated_at BEFORE UPDATE ON public.recordings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
REVOKE ALL ON TABLE public.recordings FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recordings TO authenticated;
--> statement-breakpoint
GRANT ALL ON TABLE public.recordings TO service_role;
