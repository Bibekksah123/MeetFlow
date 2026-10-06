import Link from "next/link";

import { buttonStyles, Card } from "@meetflow/ui";

export function PlaceholderPage({
  eyebrow,
  title,
  description,
  emptyTitle,
  emptyDescription,
}: {
  eyebrow: string;
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  return (
    <div className="space-y-7">
      <div className="border-line border-b pb-6">
        <p className="text-brand mb-3 text-xs font-semibold tracking-[0.16em] uppercase">
          {eyebrow}
        </p>
        <h1 className="text-ink text-3xl font-semibold tracking-[-0.04em]">{title}</h1>
        <p className="text-muted mt-2 max-w-2xl text-sm leading-6">{description}</p>
      </div>
      <Card className="flex min-h-80 flex-col items-center justify-center px-6 py-12 text-center">
        <span
          aria-hidden="true"
          className="bg-brand-soft text-brand grid size-12 place-items-center rounded-2xl"
        >
          <WorkspaceMark />
        </span>
        <h2 className="text-ink mt-4 text-base font-semibold">{emptyTitle}</h2>
        <p className="text-muted mt-2 max-w-md text-sm leading-6">{emptyDescription}</p>
        <Link href="/" className={`mt-5 ${buttonStyles({ variant: "secondary", size: "sm" })}`}>
          Back to overview
        </Link>
      </Card>
    </div>
  );
}

function WorkspaceMark() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 7.5h14M5 12h9M5 16.5h6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="18" cy="16" r="3" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}
