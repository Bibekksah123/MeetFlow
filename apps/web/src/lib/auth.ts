import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export type UserProfile = {
  id: string;
  email: string | null;
  displayName: string;
};

export async function getCurrentUser(): Promise<UserProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  const claims = data?.claims;
  if (error || !claims || typeof claims.sub !== "string") return null;

  const metadata = claims.user_metadata;
  const displayName =
    (typeof metadata?.full_name === "string" && metadata.full_name.trim()) ||
    (typeof metadata?.name === "string" && metadata.name.trim()) ||
    (typeof claims.email === "string" ? claims.email : null) ||
    "MeetFlow user";

  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : null,
    displayName,
  };
}

export async function requireUser(): Promise<UserProfile> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Return an email only after Supabase confirms it belongs to this signed-in account. */
export async function getVerifiedUserEmail(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (
    error ||
    !data.user ||
    data.user.id !== userId ||
    !data.user.email_confirmed_at ||
    !data.user.email
  ) {
    return null;
  }

  return data.user.email.trim().toLowerCase();
}
