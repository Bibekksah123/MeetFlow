ALTER TABLE "meeting_summaries" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "meeting_summaries" ADD CONSTRAINT "meeting_summaries_attempt_count_range" CHECK ("meeting_summaries"."attempt_count" BETWEEN 0 AND 3);
--> statement-breakpoint
CREATE FUNCTION public.request_meeting_analysis(target_meeting_id uuid)
RETURNS public.analysis_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_status public.analysis_status;
BEGIN
  IF NOT public.meetflow_is_meeting_owner(target_meeting_id) THEN
    RAISE EXCEPTION 'Meeting owner authorization required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.transcripts t
    WHERE t.meeting_id = target_meeting_id
      AND t.status = 'completed'
      AND t.content IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'A completed transcript is required' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.meeting_summaries (meeting_id, status, attempt_count)
  VALUES (target_meeting_id, 'pending', 0)
  ON CONFLICT (meeting_id) DO UPDATE
  SET status = 'pending',
      error_message = NULL,
      updated_at = now()
  WHERE public.meeting_summaries.status = 'failed'
    AND public.meeting_summaries.attempt_count < 3
  RETURNING status INTO current_status;

  IF current_status IS NULL THEN
    SELECT s.status INTO current_status
    FROM public.meeting_summaries s
    WHERE s.meeting_id = target_meeting_id;
  END IF;

  RETURN current_status;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.request_meeting_analysis(uuid) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.request_meeting_analysis(uuid) TO authenticated;
