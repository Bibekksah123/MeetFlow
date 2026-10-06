import type { HTMLAttributes } from "react";

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function Avatar({
  name,
  size = "md",
  className = "",
}: HTMLAttributes<HTMLSpanElement> & { name: string; size?: "sm" | "md" | "lg" }) {
  const dimensions = { sm: "size-8 text-[10px]", md: "size-9 text-xs", lg: "size-12 text-sm" };

  return (
    <span
      role="img"
      aria-label={name}
      className={`grid shrink-0 place-items-center rounded-full bg-[#e8edf2] font-semibold text-[#536273] ${dimensions[size]} ${className}`}
    >
      {initials(name)}
    </span>
  );
}
