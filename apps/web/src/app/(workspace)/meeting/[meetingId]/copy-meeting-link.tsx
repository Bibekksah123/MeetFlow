"use client";

import { useState } from "react";

import { Button, Input } from "@meetflow/ui";

export function CopyMeetingLink({ meetingId }: { meetingId: string }) {
  const [status, setStatus] = useState("");
  const meetingPath = `/meeting/${meetingId}`;

  async function copyLink() {
    try {
      const meetingUrl = new URL(meetingPath, window.location.origin).toString();
      await navigator.clipboard.writeText(meetingUrl);
      setStatus("Meeting link copied.");
    } catch {
      setStatus("Clipboard access is unavailable. Copy the room URL from the browser address bar.");
    }
  }

  return (
    <div className="space-y-3">
      <Input label="Meeting path" readOnly value={meetingPath} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="button" variant="secondary" onClick={copyLink}>
          Copy meeting link
        </Button>
        <p role="status" aria-live="polite" className="text-muted min-h-5 text-xs">
          {status}
        </p>
      </div>
    </div>
  );
}
