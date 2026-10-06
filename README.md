# MeetFlow

MeetFlow is a meeting workspace that records a LiveKit room, stores recordings privately, and turns completed recordings into transcripts for meeting members.

## Local development

1. Copy `.env.example` to the repository root as `.env.local` and fill the values used by your configured services. Keep this file private.
2. Install dependencies with `bun install`.
3. Apply database changes with `bun run db:migrate`.
4. Start the web application and transcription worker together with `bun run dev`.

From `apps/worker`, run `bun run dev` to start only the meeting processing worker.

## Transcription flow

When a recording is marked complete, a database trigger queues one transcript for that meeting. The worker polls PostgreSQL, claims jobs with `SKIP LOCKED`, reads the matching MP4 from the private S3-compatible bucket, converts it to mono MP3 with FFmpeg, and sends it to Google's Gemini `gemini-3.5-transcribe` model. Transcript text is stored in PostgreSQL and is readable by meeting members under row-level security. Meeting hosts can queue older completed recordings and retry failed jobs up to three attempts.

The worker converts recordings to mono MP3 with its bundled FFmpeg binary before upload, then removes temporary files and best-effort deletes the temporary Gemini upload. Source recordings are limited to 1 GB and compressed uploads to 25 MB. The current model returns text without speaker labels or timestamps. Configure `GEMINI_API_KEY` in the repository root `.env.local`; keep it server-side. Audio and transcript text are sent to Google for transcription and analysis. Gemini API's free tier currently allows free model use but may use submitted content to improve Google's products; the paid tier says submitted content is not used for that purpose. Check the [current Gemini pricing and data terms](https://ai.google.dev/gemini-api/docs/pricing) before processing sensitive meetings, and obtain participant consent.

After transcription, the worker queues a separate AI analysis. Gemini `gemini-3.1-flash-lite` returns schema-constrained JSON which is validated with Zod before the worker saves the summary, key points, decisions, proposed action items, open questions, risks, and follow-ups. Invalid output gets one retry; analysis failures do not discard the transcript. Previously completed transcripts are queued automatically when the worker runs. Action items remain `proposed` until an owner reviews them; only approved items are sent to n8n. The meeting page shows the analysis and its supporting transcript excerpts to meeting members.

## Cost controls and usage limits

- AI runs after recording completion. MeetFlow does not run realtime AI during meetings. The worker only analyzes completed transcripts and sleeps for 15 seconds between idle queue checks.
- Audio is downmixed to mono 16 kHz at 24 kbps before Gemini upload. Source recordings larger than 1 GB and compressed audio larger than 25 MB are rejected. Analysis input is limited to 300,000 characters.
- Transcription and analysis jobs stop after three attempts. A structured analysis or meeting answer gets at most one validation retry. Text-generation responses have an explicit output-token budget, and the model response schema caps the number of generated items.
- Gemini request storage is disabled where supported, and temporary uploaded audio is deleted after transcription. Google's free-tier data-use terms still apply to submitted content.
- Meeting questions are limited to 10 per user per minute per running web process. This is a burst limit, not a monthly quota, and it does not coordinate across multiple web instances.
- LiveKit Cloud's Build plan currently includes hard quotas such as 5,000 WebRTC participant minutes, 50 GB of downstream transfer, and 60 composite egress/transcode minutes. Supabase Free currently includes 1 GB of Storage and 500 MB of database size. Limits and prices change; check [LiveKit quotas](https://docs.livekit.io/deploy/admin/quotas-and-limits/) and [Supabase pricing](https://supabase.com/pricing) for the current account allowances.
- MeetFlow does not yet enforce per-user monthly recording-minute, AI-call, or retained-storage quotas, and it does not automatically delete recordings. The provider free-plan quotas are a hard outer cap on supported free plans, not a substitute for account-level product limits. Add database-backed monthly usage accounting and an explicit user-facing retention policy before opening a paid or multi-tenant production service; do not silently remove meeting recordings.

## Approved tasks to Notion through n8n

The task review API sends a fixed `create_task` action to n8n only after an owner approves a proposed task. Configure `N8N_TASK_WEBHOOK_URL` with the published Production URL from an n8n Webhook node, and `N8N_WEBHOOK_SECRET` with the value of its Header Auth credential. The credential's header name must be `X-MeetFlow-Secret`. Keep both variables server-side. `N8N_API_KEY` is not used for this webhook integration.

Configure the n8n Webhook node for `POST` and Header Auth, then add a Notion node that creates a page in the chosen database. The incoming values are under `body`: for example `body.task.title`, `body.task.description`, `body.task.assignee`, `body.task.deadline`, `body.task.priority`, `body.meeting.title`, and `body.task.id`. Store `body.task.id` in a Notion text property named `MeetFlow Task ID`; check for an existing ID before creating a page so retries don't create duplicate tasks. With the webhook set to respond immediately, MeetFlow confirms that n8n accepted the request, not that Notion finished creating the page; verify the execution in n8n.

Run `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build`, and `bun run db:verify` to check the monorepo and database permissions.

For production, deploy `@meetflow/web` and `@meetflow/worker` as separate processes. Give both the private database URL; give the worker the Gemini key and S3-compatible recording credentials. Do not expose those credentials to browser code.
