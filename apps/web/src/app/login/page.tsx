import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-form";
import { AuthPage } from "@/components/auth-page";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ auth_error?: string }>;
}) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { auth_error: authError } = await searchParams;

  return (
    <AuthPage title="Welcome back" description="Log in to continue your meeting follow-through.">
      <AuthForm
        mode="login"
        notice={
          authError === "callback"
            ? "That sign-in link could not be verified. It may have expired; please try again or request a new link."
            : undefined
        }
      />
    </AuthPage>
  );
}
