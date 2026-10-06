import type { Metadata } from "next";
import Link from "next/link";

import { buttonStyles } from "@meetflow/ui";

import { CreateMeetingForm } from "./create-meeting-form";

export const metadata: Metadata = { title: "Create meeting" };

export default function NewMeetingPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-7">
      <div className="border-line border-b pb-6">
        <Link
          href="/meetings"
          className={`${buttonStyles({ variant: "ghost", size: "sm" })} mb-4 -ml-3`}
        >
          <span aria-hidden="true">←</span> All meetings
        </Link>
        <p className="text-brand mb-3 text-xs font-semibold tracking-[0.16em] uppercase">
          Meeting space
        </p>
        <h1 className="text-ink text-3xl font-semibold tracking-[-0.04em]">Create a meeting</h1>
        <p className="text-muted mt-2 max-w-2xl text-sm leading-6">
          Set up a room, add allowed participant emails, then share the meeting link yourself.
        </p>
      </div>
      <CreateMeetingForm />
    </div>
  );
}
