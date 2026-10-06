"use client";

import { useEffect } from "react";

export function Toast({
  message,
  onDismiss,
  duration = 4000,
}: {
  message: string;
  onDismiss?: () => void;
  duration?: number;
}) {
  useEffect(() => {
    if (!onDismiss || duration <= 0) return;
    const timeout = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timeout);
  }, [duration, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-line text-ink flex max-w-sm items-center justify-between gap-4 rounded-xl border bg-white px-4 py-3 text-sm shadow-lg"
    >
      <span>{message}</span>
      {onDismiss ? (
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={onDismiss}
          className="text-muted hover:text-ink focus-visible:ring-brand rounded px-1 focus-visible:ring-2 focus-visible:outline-none"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
