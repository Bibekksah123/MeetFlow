"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button, ErrorState, Input } from "@meetflow/ui";

import { createClient } from "@/lib/supabase/client";

export function ProfileForm({ displayName }: { displayName: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus(null);
    setPending(true);

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("full_name") ?? "").trim();

    if (!name) {
      setError("Enter a name before saving your profile.");
      setPending(false);
      return;
    }

    try {
      const { error: updateError } = await createClient().auth.updateUser({
        data: { full_name: name },
      });
      if (updateError) throw updateError;
      setStatus("Your profile was updated.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not update your profile.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="max-w-lg space-y-4" onSubmit={handleSubmit}>
      {error ? <ErrorState description={error} /> : null}
      {status ? <p role="status" className="text-sm text-[#37774f]">{status}</p> : null}
      <Input
        name="full_name"
        label="Name"
        autoComplete="name"
        required
        minLength={1}
        maxLength={80}
        defaultValue={displayName}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
