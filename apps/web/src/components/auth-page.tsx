import Link from "next/link";
import type { ReactNode } from "react";

import { Card } from "@meetflow/ui";

export function AuthPage({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-canvas min-h-screen">
      <header className="border-line flex h-16 items-center border-b bg-white px-4 sm:px-7">
        <Link href="/" className="text-ink text-lg font-semibold tracking-[-0.04em]">
          MeetFlow
        </Link>
      </header>
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-lg flex-col justify-center px-4 py-10">
        <div className="mb-5">
          <p className="text-brand mb-2 text-xs font-semibold tracking-[0.16em] uppercase">
            Your meeting workspace
          </p>
          <h1 className="text-ink text-2xl font-semibold tracking-[-0.04em]">{title}</h1>
          <p className="text-muted mt-2 text-sm leading-6">{description}</p>
        </div>
        <Card className="p-5 sm:p-7">{children}</Card>
        <p className="text-muted mt-5 text-center text-xs leading-5">
          Your conversations and account details stay within your MeetFlow workspace.
        </p>
      </main>
    </div>
  );
}
