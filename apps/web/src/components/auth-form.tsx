"use client";

import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";

import { Button, ErrorState, Input } from "@meetflow/ui";

import { createClient } from "@/lib/supabase/client";

type AuthMode = "login" | "signup" | "forgot-password" | "update-password";

export function AuthForm({ mode, notice }: { mode: AuthMode; notice?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const isLogin = mode === "login";
  const isSignup = mode === "signup";
  const isForgotPassword = mode === "forgot-password";
  const isUpdatePassword = mode === "update-password";
  const googleEnabled = process.env.NEXT_PUBLIC_SUPABASE_GOOGLE_ENABLED === "true";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus(null);
    setPending(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");

    try {
      const supabase = createClient();

      if (isLogin) {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        window.location.replace("/dashboard");
        return;
      }

      if (isSignup) {
        const displayName = String(formData.get("full_name") ?? "").trim();
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: getAuthCallbackUrl("/dashboard"),
            data: { full_name: displayName },
          },
        });
        if (authError) throw authError;

        if (data.session) {
          window.location.replace("/dashboard");
          return;
        }

        setStatus("If this address can be registered, a confirmation link will arrive by email.");
        return;
      }

      if (isForgotPassword) {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: getAuthCallbackUrl("/forgot-password?mode=update"),
        });
        if (authError) throw authError;
        setStatus("If an account uses this address, a password reset link will arrive by email.");
        return;
      }

      const confirmPassword = String(formData.get("confirm_password") ?? "");
      if (password !== confirmPassword) {
        setError("The passwords do not match.");
        return;
      }

      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) throw authError;
      window.location.replace("/dashboard");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We could not complete that request.");
    } finally {
      setPending(false);
    }
  }

  async function handleGoogleSignIn() {
    setError(null);
    setPending(true);
    try {
      const { error: authError } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: getAuthCallbackUrl("/dashboard") },
      });
      if (authError) throw authError;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Google sign-in could not be started.");
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      {notice ? (
        <p role="status" className="rounded-xl bg-[#fbf2dd] px-4 py-3 text-sm leading-6 text-[#755819]">
          {notice}
        </p>
      ) : null}
      {error ? <ErrorState description={error} /> : null}
      {status ? (
        <p role="status" aria-live="polite" className="rounded-xl bg-[#eef7f5] px-4 py-3 text-sm leading-6 text-[#245c53]">
          {status}
        </p>
      ) : null}

      {googleEnabled && (isLogin || isSignup) ? (
        <>
          <Button variant="secondary" className="w-full" disabled={pending} onClick={handleGoogleSignIn}>
            <GoogleMark />
            Continue with Google
          </Button>
          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="bg-line h-px flex-1" />
            <span className="text-muted text-xs">or use email</span>
            <span className="bg-line h-px flex-1" />
          </div>
        </>
      ) : null}

      <form className="space-y-4" onSubmit={handleSubmit}>
        {isSignup ? (
          <Input
            name="full_name"
            label="Your name"
            autoComplete="name"
            placeholder="Alex Morgan"
            required
            maxLength={80}
          />
        ) : null}

        {isLogin || isSignup || isForgotPassword ? (
          <Input
            name="email"
            label="Email address"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            required
            maxLength={254}
          />
        ) : null}

        {isLogin || isSignup || isUpdatePassword ? (
          <Input
            name="password"
            label={isUpdatePassword ? "New password" : "Password"}
            type="password"
            autoComplete={isLogin ? "current-password" : "new-password"}
            minLength={8}
            maxLength={128}
            required
          />
        ) : null}

        {isUpdatePassword ? (
          <Input
            name="confirm_password"
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            required
          />
        ) : null}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending
            ? "Please wait…"
            : isLogin
              ? "Log in"
              : isSignup
                ? "Create account"
                : isForgotPassword
                  ? "Send reset link"
                  : "Update password"}
        </Button>
      </form>

      {isLogin ? (
        <div className="flex flex-col items-center gap-3 text-sm">
          <Link href="/forgot-password" className="text-brand hover:text-brand-dark font-medium">
            Forgot your password?
          </Link>
          <p className="text-muted">
            New to MeetFlow?{" "}
            <Link href="/signup" className="text-brand hover:text-brand-dark font-semibold">
              Create an account
            </Link>
          </p>
        </div>
      ) : null}

      {isSignup ? (
        <p className="text-muted text-center text-sm">
          Already have an account?{" "}
          <Link href="/login" className="text-brand hover:text-brand-dark font-semibold">
            Log in
          </Link>
        </p>
      ) : null}

      {isForgotPassword || isUpdatePassword ? (
        <p className="text-center text-sm">
          <Link href="/login" className="text-brand hover:text-brand-dark font-semibold">
            Back to log in
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function getAuthCallbackUrl(next: "/dashboard" | "/forgot-password?mode=update") {
  const origin = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
  const callbackUrl = new URL("/auth/callback", origin);
  callbackUrl.searchParams.set("next", next);
  return callbackUrl.toString();
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 48 48">
      <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4 6.2v5.1h6.5c3.8-3.5 6.1-8.7 6.1-15Z" />
      <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9L31 34c-1.8 1.2-4.1 2-7 2-5.4 0-9.9-3.6-11.6-8.4H5.7v5.2A20 20 0 0 0 24 44Z" />
      <path fill="#FBBC05" d="M12.4 27.6a12 12 0 0 1 0-7.2v-5.2H5.7a20 20 0 0 0 0 17.6l6.7-5.2Z" />
      <path fill="#EA4335" d="M24 12c3 0 5.7 1 7.8 3.1l5.8-5.8A19.2 19.2 0 0 0 24 4 20 20 0 0 0 5.7 15.2l6.7 5.2C14.1 15.6 18.6 12 24 12Z" />
    </svg>
  );
}
