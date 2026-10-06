CREATE TYPE "public"."automation_run_status" AS ENUM('pending', 'accepted', 'not_configured', 'failed');--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_item_id" uuid NOT NULL,
	"meeting_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"action" varchar(40) NOT NULL,
	"destination" varchar(40) NOT NULL,
	"status" "automation_run_status" DEFAULT 'pending' NOT NULL,
	"result_summary" text NOT NULL,
	"http_status" integer,
	"error_code" varchar(80),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "automation_runs_action_allowed" CHECK ("automation_runs"."action" = 'create_task'),
	CONSTRAINT "automation_runs_destination_allowed" CHECK ("automation_runs"."destination" = 'notion'),
	CONSTRAINT "automation_runs_http_status_range" CHECK ("automation_runs"."http_status" IS NULL OR "automation_runs"."http_status" BETWEEN 100 AND 599)
);
--> statement-breakpoint
ALTER TABLE "automation_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_action_item_id_action_items_id_fk" FOREIGN KEY ("action_item_id") REFERENCES "public"."action_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_runs_meeting_created_idx" ON "automation_runs" USING btree ("meeting_id","created_at");--> statement-breakpoint
CREATE INDEX "automation_runs_action_item_created_idx" ON "automation_runs" USING btree ("action_item_id","created_at");--> statement-breakpoint
CREATE POLICY "automation_runs_select_owner" ON "automation_runs" AS PERMISSIVE FOR SELECT TO "authenticated" USING (
        public.meetflow_is_meeting_owner("automation_runs"."meeting_id")
        AND EXISTS (
          SELECT 1 FROM public.action_items ai
          WHERE ai.id = "automation_runs"."action_item_id" AND ai.meeting_id = "automation_runs"."meeting_id"
        )
      );--> statement-breakpoint
CREATE POLICY "automation_runs_insert_owner" ON "automation_runs" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (
        "automation_runs"."requested_by" = (select auth.uid())
        AND public.meetflow_is_meeting_owner("automation_runs"."meeting_id")
        AND EXISTS (
          SELECT 1 FROM public.action_items ai
          WHERE ai.id = "automation_runs"."action_item_id" AND ai.meeting_id = "automation_runs"."meeting_id"
        )
      );--> statement-breakpoint
CREATE POLICY "automation_runs_update_owner" ON "automation_runs" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (
        "automation_runs"."requested_by" = (select auth.uid())
        AND public.meetflow_is_meeting_owner("automation_runs"."meeting_id")
        AND EXISTS (
          SELECT 1 FROM public.action_items ai
          WHERE ai.id = "automation_runs"."action_item_id" AND ai.meeting_id = "automation_runs"."meeting_id"
        )
      ) WITH CHECK (
        "automation_runs"."requested_by" = (select auth.uid())
        AND public.meetflow_is_meeting_owner("automation_runs"."meeting_id")
        AND EXISTS (
          SELECT 1 FROM public.action_items ai
          WHERE ai.id = "automation_runs"."action_item_id" AND ai.meeting_id = "automation_runs"."meeting_id"
        )
      );
--> statement-breakpoint
REVOKE ALL ON TABLE public.automation_runs FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE public.automation_runs TO authenticated;
--> statement-breakpoint
GRANT ALL ON TABLE public.automation_runs TO service_role;
