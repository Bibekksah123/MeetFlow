import { useId } from "react";
import type { InputHTMLAttributes } from "react";

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  id?: string;
  label?: string;
  hint?: string;
  error?: string;
};

export function Input({ id, label, hint, error, className = "", ...props }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="grid gap-1.5">
      {label ? (
        <label htmlFor={inputId} className="text-ink text-sm font-medium">
          {label}
        </label>
      ) : null}
      <input
        id={inputId}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={`border-line text-ink focus:border-brand focus:ring-brand/15 min-h-10 w-full rounded-lg border bg-white px-3 text-sm outline-none placeholder:text-[#9aa4b2] focus:ring-2 disabled:cursor-not-allowed disabled:bg-[#f4f6f8] ${className}`}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-muted text-xs">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-[#b73b43]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
