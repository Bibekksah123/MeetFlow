import type { Metadata } from "next";

import { Card } from "@meetflow/ui";

import { ProfileForm } from "@/components/profile-form";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();

  return (
    <div className="space-y-7">
      <div className="border-line border-b pb-6">
        <p className="text-brand mb-3 text-xs font-semibold tracking-[0.16em] uppercase">Your workspace</p>
        <h1 className="text-ink text-3xl font-semibold tracking-[-0.04em]">Profile</h1>
        <p className="text-muted mt-2 max-w-2xl text-sm leading-6">
          Manage the name shown in your MeetFlow workspace.
        </p>
      </div>
      <Card className="p-5 sm:p-7">
        <div className="mb-5">
          <h2 className="text-ink text-base font-semibold">Personal details</h2>
          <p className="text-muted mt-1 text-sm">Your account email is {user.email ?? "not available"}.</p>
        </div>
        <ProfileForm displayName={user.displayName} />
      </Card>
    </div>
  );
}
