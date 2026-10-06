"use client";

import { useEffect, useState } from "react";

import { Button } from "@meetflow/ui";

type RecordingView = {
  id: string;
  status: "pending" | "recording" | "processing" | "completed" | "failed";
  readyToStop: boolean;
  durationSeconds: number | null;
  errorCode: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export function RecordingControls({
  meetingId,
  meetingStatus,
  isHost,
  initialRecording,
}: {
  meetingId: string;
  meetingStatus: "scheduled" | "active" | "completed";
  isHost: boolean;
  initialRecording: RecordingView | null;
}) {
  const [recording, setRecording] = useState(initialRecording);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [participantsConsented, setParticipantsConsented] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const refresh = async () => {
      try {
        const response = await fetch(`/api/meetings/${meetingId}/recordings`, {
          cache: "no-store",
        });
        if (response.ok) {
          const payload = (await response.json()) as { recording: RecordingView | null };
          if (!cancelled) setRecording(payload.recording);
        }
      } catch {
        // Status remains visible from the last successful request.
      }

      if (!cancelled) {
        const pollInterval =
          recording?.status === "recording" && !recording.readyToStop ? 2000 : 5000;
        timer = setTimeout(refresh, pollInterval);
      }
    };

    timer = setTimeout(refresh, 5000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [meetingId, recording?.status, recording?.readyToStop]);

  async function submit(action: "start" | "stop") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/meetings/${meetingId}/recordings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "start" ? { action, participantsConsented } : { action }),
      });
      const payload = (await response.json()) as {
        error?: string;
        recording?: RecordingView | null;
      };
      if (!response.ok || !payload.recording) {
        if (payload.recording) setRecording(payload.recording);
        setError(payload.error ?? "Recording could not be updated. Try again.");
        return;
      }
      setRecording(payload.recording);
    } catch {
      setError("Recording could not be updated. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="recording-heading"
      id="recording"
      className="border-line scroll-mt-6 rounded-2xl border bg-white p-5 sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="recording-heading" className="text-ink text-base font-semibold">
            Recording
          </h2>
          <p className="text-muted mt-1 max-w-xl text-sm leading-5">
            Recordings are stored privately in MeetFlow. MeetFlow sends audio and transcripts to
            Google Gemini for transcription and analysis. If the configured Gemini project uses
            unpaid services, Google may use submitted content to provide, improve, and develop its
            products and services. Avoid confidential or sensitive meetings unless your organization
            has reviewed and accepted those terms. Read the{" "}
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
          {recording ? <RecordingStatus recording={recording} /> : null}
          {isHost &&
          meetingStatus === "active" &&
          (!recording || recording.status === "failed" || recording.status === "completed") ? (
            <label className="border-line mt-4 flex cursor-pointer items-start gap-3 rounded-xl border bg-[#fbfcfd] p-3.5 text-sm leading-5">
              <input
                type="checkbox"
                checked={participantsConsented}
                onChange={(event) => setParticipantsConsented(event.target.checked)}
                className="border-line text-brand focus:ring-brand mt-0.5 size-4 shrink-0 rounded"
              />
              <span className="text-ink">
                I have explained the recording and Google Gemini processing to everyone here, have
                their agreement, and will inform anyone who joins later.
              </span>
            </label>
          ) : null}
        </div>

        {isHost && meetingStatus === "active" ? (
          recording?.status === "recording" && recording.readyToStop ? (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => submit("stop")}
            >
              {busy ? "Stopping…" : "Stop recording"}
            </Button>
          ) : recording?.status === "pending" ||
            recording?.status === "processing" ||
            recording?.status === "recording" ? (
            <Button type="button" variant="secondary" disabled>
              {recording.status === "processing" ? "Finalizing…" : "Starting…"}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={busy || !participantsConsented}
              onClick={() => submit("start")}
            >
              {busy
                ? "Starting…"
                : recording?.status === "failed"
                  ? "Retry recording"
                  : "Start recording"}
            </Button>
          )
        ) : null}
      </div>
      {meetingStatus === "scheduled" ? (
        <p className="text-muted mt-4 text-sm">Join the room before starting a recording.</p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-[#fff5df] px-3 py-2 text-sm text-[#76551b]">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function RecordingStatus({ recording }: { recording: RecordingView }) {
  const copy: Record<RecordingView["status"], string> = {
    pending: "Preparing the recording…",
    recording: recording.readyToStop
      ? "This meeting is being recorded."
      : "Preparing the recording…",
    processing: "The recording is being finalized and uploaded.",
    completed: "Recording saved to private storage.",
    failed: "Recording failed. The host can retry while the meeting is active.",
  };

  return (
    <p role="status" className="text-ink mt-3 text-sm">
      {recording.status === "recording" ? (
        <span aria-hidden="true" className="mr-2 inline-block h-2 w-2 rounded-full bg-red-600" />
      ) : null}
      {copy[recording.status]}
      {recording.status === "completed" && recording.durationSeconds !== null
        ? ` · ${formatDuration(recording.durationSeconds)}`
        : null}
    </p>
  );
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
}
