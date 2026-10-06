import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

export type ButtonStyleOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-dark focus-visible:ring-brand",
  secondary: "border border-line bg-white text-ink hover:bg-[#f8fafb] focus-visible:ring-brand",
  ghost: "bg-transparent text-brand hover:bg-brand-soft focus-visible:ring-brand",
  danger: "bg-[#b73b43] text-white hover:bg-[#9f3038] focus-visible:ring-[#b73b43]",
};

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3.5 text-xs",
  md: "min-h-10 px-4 text-sm",
};

export function buttonStyles({
  variant = "primary",
  size = "md",
  className = "",
}: ButtonStyleOptions = {}) {
  return `inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`;
}

export function Button({
  variant = "primary",
  size = "md",
  type = "button",
  className = "",
  ...props
}: ButtonProps) {
  return <button type={type} className={buttonStyles({ variant, size, className })} {...props} />;
}
