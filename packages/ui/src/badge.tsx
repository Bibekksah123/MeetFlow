import type { HTMLAttributes } from "react";

const styles = {
  neutral: "bg-[#f0f3f6] text-[#5d6b7c]",
  brand: "bg-brand-soft text-brand-dark",
  success: "bg-[#e9f5ed] text-[#37774f]",
  warning: "bg-[#fbf2dd] text-[#88661c]",
  danger: "bg-[#fbeaec] text-[#a53d45]",
} as const;

export function Badge({
  variant = "neutral",
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof styles }) {
  return (
    <span
      className={`inline-flex min-h-6 items-center rounded-full px-2.5 text-[11px] font-semibold ${styles[variant]} ${className}`}
      {...props}
    />
  );
}
