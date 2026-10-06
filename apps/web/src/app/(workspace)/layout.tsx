import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const profile = await requireUser();

  return (
    <AppShell profile={{ displayName: profile.displayName, email: profile.email }}>
      {children}
    </AppShell>
  );
}
