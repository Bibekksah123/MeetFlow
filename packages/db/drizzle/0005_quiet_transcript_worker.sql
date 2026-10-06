ALTER TABLE public.transcripts
  ADD COLUMN recording_id uuid REFERENCES public.recordings(id) ON DELETE CASCADE,
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT transcripts_attempt_count_range CHECK (attempt_count BETWEEN 0 AND 3);
--> statement-breakpoint
CREATE UNIQUE INDEX transcripts_recording_uidx
  ON public.transcripts (recording_id)
  WHERE recording_id IS NOT NULL;
--> statement-breakpoint
CREATE FUNCTION public.queue_completed_recording_transcript()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.transcripts (meeting_id, recording_id, status)
  VALUES (NEW.meeting_id, NEW.id, 'pending')
  ON CONFLICT (meeting_id) DO UPDATE
  SET recording_id = EXCLUDED.recording_id,
      content = NULL,
      segments = '[]'::jsonb,
      status = 'pending',
      attempt_count = 0,
      error_message = NULL,
      started_at = NULL,
      completed_at = NULL,
      updated_at = now()
  WHERE public.transcripts.recording_id IS DISTINCT FROM EXCLUDED.recording_id;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.queue_completed_recording_transcript() FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
CREATE TRIGGER recordings_queue_transcript_insert
  AFTER INSERT ON public.recordings
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND NEW.object_key IS NOT NULL)
  EXECUTE FUNCTION public.queue_completed_recording_transcript();
--> statement-breakpoint
CREATE TRIGGER recordings_queue_transcript_update
  AFTER UPDATE OF status ON public.recordings
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed' AND NEW.object_key IS NOT NULL)
  EXECUTE FUNCTION public.queue_completed_recording_transcript();
--> statement-breakpoint
CREATE FUNCTION public.request_meeting_transcription(target_meeting_id uuid, target_recording_id uuid)
RETURNS public.transcript_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_status public.transcript_status;
BEGIN
  IF NOT public.meetflow_is_meeting_owner(target_meeting_id) THEN
    RAISE EXCEPTION 'Meeting owner authorization required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.recordings r
    WHERE r.id = target_recording_id
      AND r.meeting_id = target_meeting_id
      AND r.status = 'completed'
      AND r.object_key IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'A completed recording is required' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.transcripts (meeting_id, recording_id, status)
  VALUES (target_meeting_id, target_recording_id, 'pending')
  ON CONFLICT (meeting_id) DO UPDATE
  SET recording_id = EXCLUDED.recording_id,
      content = NULL,
      segments = '[]'::jsonb,
      status = 'pending',
      attempt_count = CASE
        WHEN public.transcripts.recording_id IS DISTINCT FROM EXCLUDED.recording_id THEN 0
        ELSE public.transcripts.attempt_count
      END,
      error_message = NULL,
      started_at = NULL,
      completed_at = NULL,
      updated_at = now()
  WHERE public.transcripts.recording_id IS DISTINCT FROM EXCLUDED.recording_id
     OR (public.transcripts.status = 'failed' AND public.transcripts.attempt_count < 3)
  RETURNING status INTO current_status;

  IF current_status IS NULL THEN
    SELECT t.status INTO current_status
    FROM public.transcripts t
    WHERE t.meeting_id = target_meeting_id;
  END IF;

  RETURN current_status;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.request_meeting_transcription(uuid, uuid) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.request_meeting_transcription(uuid, uuid) TO authenticated;
