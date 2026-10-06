"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@meetflow/ui";

export function SampleTaskButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function createSampleTask() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/action-items/sample", { method: "POST" });
      const payload = (await response.json()) as { created?: boolean; error?: string };
      if (!response.ok) {
        setError(payload.error ?? "We could not add a sample task. Please try again.");
        return;
      }

      setNotice(
        payload.created
          ? "Sample task added as a proposal. Approve it only after the n8n webhook is configured."
          : "Your sample task is already available in the task list.",
      );
      router.refresh();
    } catch {
      setError("We could not reach MeetFlow. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={createSampleTask}
      >
        {busy ? "Adding sample task…" : "Add sample task"}
      </Button>
      {notice ? (
        <p className="text-muted max-w-sm text-xs leading-5" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="max-w-sm text-xs leading-5 text-[#a53d45]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
