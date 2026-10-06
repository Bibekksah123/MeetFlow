"use client";

import { useActionState } from "react";

import { Button, Card, ErrorState, Input } from "@meetflow/ui";

import { createMeetingAction } from "../actions";

export function CreateMeetingForm() {
  const [state, formAction, pending] = useActionState(createMeetingAction, {
    error: null,
    success: null,
  });

  return (
    <Card className="p-5 sm:p-7">
      <form action={formAction} className="space-y-5">
        {state.error ? <ErrorState description={state.error} /> : null}
        <Input
          name="title"
          label="Meeting title"
          placeholder="Product kickoff"
          autoComplete="off"
          required
          maxLength={180}
        />
        <div className="grid gap-1.5">
          <label htmlFor="meeting-description" className="text-ink text-sm font-medium">
            Description <span className="text-muted font-normal">(optional)</span>
          </label>
          <textarea
            id="meeting-description"
            name="description"
            rows={3}
            maxLength={5000}
            placeholder="What would you like to cover?"
            className="border-line text-ink focus:border-brand focus:ring-brand/15 w-full resize-y rounded-lg border bg-white px-3 py-2.5 text-sm leading-6 outline-none placeholder:text-[#9aa4b2] focus:ring-2"
          />
        </div>
        <div className="grid gap-1.5">
          <label htmlFor="meeting-invitees" className="text-ink text-sm font-medium">
            Participant email addresses <span className="text-muted font-normal">(optional)</span>
          </label>
          <textarea
            id="meeting-invitees"
            name="invitees"
            rows={3}
            maxLength={4096}
            placeholder="alex@example.com, sam@example.com"
            aria-describedby="meeting-invitees-hint"
            className="border-line text-ink focus:border-brand focus:ring-brand/15 w-full resize-y rounded-lg border bg-white px-3 py-2.5 text-sm leading-6 outline-none placeholder:text-[#9aa4b2] focus:ring-2"
          />
          <p id="meeting-invitees-hint" className="text-muted text-xs leading-5">
            Add up to 20 people who can join, separated by commas or new lines. MeetFlow does not
            email them yet; copy and share the room link after creating it.
          </p>
        </div>
        <div className="border-line flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Creating room…" : "Create meeting room"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
