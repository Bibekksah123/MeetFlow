"use client";

import { useActionState } from "react";

import { Button, ErrorState } from "@meetflow/ui";

import { updateMeetingStatusAction } from "../../meetings/actions";

export function MeetingStatusControls({
  meetingId,
  status,
  isHost,
}: {
  meetingId: string;
  status: "scheduled" | "active" | "completed";
  isHost: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateMeetingStatusAction, {
    error: null,
    success: null,
  });

  if (!isHost) {
    return <p className="text-muted text-sm">Only the meeting host can end the meeting.</p>;
  }

  return (
    <div className="space-y-3">
      {state.error ? <ErrorState description={state.error} /> : null}
      {state.success ? (
        <p role="status" className="text-sm text-[#37774f]">
          {state.success}
        </p>
      ) : null}
      {state.warning ? (
        <p role="alert" className="rounded-lg bg-[#fff5df] px-3 py-2 text-sm text-[#76551b]">
          {state.warning}
        </p>
      ) : null}
      {status === "scheduled" ? (
        <p className="text-muted text-sm">Join the live room to start this meeting.</p>
      ) : status === "active" ? (
        <form action={formAction}>
          <input type="hidden" name="meetingId" value={meetingId} />
          <input type="hidden" name="status" value="completed" />
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Ending meeting…" : "End meeting for everyone"}
          </Button>
        </form>
      ) : (
        <p className="text-muted text-sm">This meeting is complete.</p>
      )}
    </div>
  );
}
