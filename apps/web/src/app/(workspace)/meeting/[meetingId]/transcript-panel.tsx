"use client";

import { useEffect, useState } from "react";

import { Button, Card } from "@meetflow/ui";

type TranscriptView = {
  attemptCount: number;
  content: string | null;
  segments: { startMs: number; endMs: number; text: string; speakerId?: string }[];
  status: "pending" | "processing" | "completed" | "failed";
  errorMessage: string | null;
  completedAt: string | null;
};

export function TranscriptPanel({
  meetingId,
  isHost,
  recordingStatus,
  initialTranscript,
}: {
  meetingId: string;
  isHost: boolean;
  recordingStatus: "pending" | "recording" | "processing" | "completed" | "failed" | null;
  initialTranscript: TranscriptView | null;
}) {
  const [transcript, setTranscript] = useState(initialTranscript);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transcriptStatus = transcript?.status;
  const hasTranscript = transcript !== null;

  useEffect(() => {
    const processing = transcriptStatus === "pending" || transcriptStatus === "processing";
    const waitingForQueue =
      !hasTranscript && recordingStatus !== null && recordingStatus !== "failed";
    if (!processing && !waitingForQueue) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/meetings/${meetingId}/transcript`, {
          cache: "no-store",
        });
        if (response.ok) {
          const payload = (await response.json()) as { transcript: TranscriptView | null };
          if (!cancelled) setTranscript(payload.transcript);
        }
      } catch {
        // Keep the last successfully loaded status visible.
      }
      if (!cancelled) timer = setTimeout(refresh, processing ? 4000 : 15000);
    };

    timer = setTimeout(refresh, processing ? 2000 : 15000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [hasTranscript, meetingId, recordingStatus, transcriptStatus]);

  async function requestTranscript() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/meetings/${meetingId}/transcript`, { method: "POST" });
      const payload = (await response.json()) as {
        transcript?: TranscriptView | null;
        error?: string | null;
      };
      if (!response.ok) {
        setError(payload.error ?? "We could not queue this transcript. Try again.");
        return;
      }
      setTranscript(payload.transcript ?? null);
      setError(payload.error ?? null);
    } catch {
      setError("We could not queue this transcript. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const canRequest = isHost && recordingStatus === "completed";
  const canRetry = canRequest && transcript?.status === "failed" && transcript.attemptCount < 3;
  const needsRequest = canRequest && (!transcript || canRetry);

  return (
    <Card id="transcript" className="scroll-mt-6 p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-ink text-base font-semibold">Transcript</h2>
          <p className="text-muted mt-1 text-sm leading-5">
            After recording, MeetFlow sends the audio and transcript to Google Gemini for
            transcription and analysis. If the configured Gemini project uses unpaid services,
            Google may use submitted content to provide, improve, and develop its products and
            services. The transcript is visible to meeting members. See the{" "}
            <a
              href="https://ai.google.dev/gemini-api/terms"
              target="_blank"
              rel="noreferrer"
              className="text-brand underline underline-offset-2"
            >
              Gemini API terms
            </a>
            .
          </p>
        </div>
        {needsRequest ? (
          <Button type="button" variant="secondary" disabled={busy} onClick={requestTranscript}>
            {busy ? "Queuing…" : canRetry ? "Retry transcription" : "Transcribe recording"}
          </Button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-[#fff5df] px-3 py-2 text-sm text-[#76551b]">
          {error}
        </p>
      ) : null}

      {transcript?.status === "pending" || transcript?.status === "processing" ? (
        <p role="status" className="text-muted mt-4 rounded-xl bg-[#f6f8fb] px-4 py-3 text-sm">
          {transcript.status === "pending"
            ? "Transcript queued. It will appear here when processing finishes."
            : "Transcribing the recording… This can take a few minutes."}
        </p>
      ) : null}

      {transcript?.status === "failed" ? (
        <div
          role="status"
          className="mt-4 rounded-xl bg-[#fff5df] px-4 py-3 text-sm text-[#76551b]"
        >
          <p>{transcript.errorMessage ?? "Transcription failed. The host can retry."}</p>
          {transcript.attemptCount >= 3 ? (
            <p className="mt-1 text-xs">The three-attempt limit has been reached.</p>
          ) : null}
        </div>
      ) : null}

      {transcript?.status === "completed" ? (
        <div className="border-line mt-4 max-h-[32rem] overflow-y-auto rounded-xl border bg-[#fbfcfd] p-4 sm:p-5">
          <p className="text-ink text-sm leading-7 break-words whitespace-pre-wrap">
            {transcript.content}
          </p>
          {transcript.segments.length === 0 ? (
            <p className="text-muted border-line mt-4 border-t pt-3 text-xs">
              Speaker labels and timestamps are not available for this transcript.
            </p>
          ) : null}
        </div>
      ) : null}

      {!transcript && recordingStatus !== "completed" ? (
        <p className="text-muted mt-4 rounded-xl bg-[#f6f8fb] px-4 py-3 text-sm">
          A transcript will be available after the recording is complete.
        </p>
      ) : null}
    </Card>
  );
}
