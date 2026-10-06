"use client";

export type DropdownItem = {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
};

export function Dropdown({ label, items }: { label: string; items: DropdownItem[] }) {
  return (
    <details className="group relative inline-block text-left">
      <summary className="border-line text-ink focus-visible:ring-brand inline-flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-lg border bg-white px-3 text-sm font-medium hover:bg-[#f8fafb] focus-visible:ring-2 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        {label}
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 20 20" fill="none">
          <path
            d="m5 7.5 5 5 5-5"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>
      <div
        role="menu"
        className="border-line absolute right-0 z-30 mt-2 min-w-44 rounded-xl border bg-white p-1.5 shadow-lg"
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={(event) => {
              item.onSelect();
              const details = event.currentTarget.closest("details");
              if (details) details.open = false;
            }}
            className="text-ink focus-visible:ring-brand flex min-h-9 w-full items-center rounded-lg px-3 text-left text-sm hover:bg-[#f4f7f8] focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
          >
            {item.label}
          </button>
        ))}
      </div>
    </details>
  );
}
