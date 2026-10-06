import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-form";
import { AuthPage } from "@/components/auth-page";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Create account" };

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/dashboard");

  return (
    <AuthPage title="Create your account" description="Keep meetings, decisions, and next steps together.">
      <AuthForm mode="signup" />
    </AuthPage>
  );
}
