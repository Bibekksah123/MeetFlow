import type { Metadata } from "next";

import { AuthForm } from "@/components/auth-form";
import { AuthPage } from "@/components/auth-page";

export const metadata: Metadata = { title: "Reset password" };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  const isUpdate = mode === "update";

  return (
    <AuthPage
      title={isUpdate ? "Choose a new password" : "Reset your password"}
      description={
        isUpdate
          ? "Choose a new password to secure your MeetFlow account."
          : "We will send a password reset link if an account matches your email."
      }
    >
      <AuthForm mode={isUpdate ? "update-password" : "forgot-password"} />
    </AuthPage>
  );
}
