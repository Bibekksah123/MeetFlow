"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { ReactNode } from "react";

import { createClient } from "@/lib/supabase/client";

const navigation = [
  { href: "/dashboard", label: "Overview", icon: "overview" },
  { href: "/meetings", label: "Meetings", icon: "meetings" },
  { href: "/tasks", label: "Tasks", icon: "tasks" },
  { href: "/settings", label: "Settings", icon: "settings" },
] as const;

export function AppShell({
  children,
  profile,
}: {
  children: ReactNode;
  profile: { displayName: string; email: string | null };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function handleSignOut() {
    setSigningOut(true);
    setSignOutError(null);
    const { error } = await createClient().auth.signOut();
    if (error) {
      setSignOutError("We could not sign you out. Please try again.");
      setSigningOut(false);
      return;
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="bg-canvas min-h-screen">
      <aside className="border-line fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r bg-white md:flex">
        <Brand className="px-6 py-6" />
        <div className="px-4 pt-5 pb-2">
          <p className="px-3 text-[10px] font-semibold tracking-[0.16em] text-[#9aa4b2] uppercase">
            Workspace
          </p>
        </div>
        <nav aria-label="Primary navigation" className="flex flex-col gap-1 px-3">
          {navigation.map((item) => (
            <NavigationLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>
        <div className="border-line mt-auto border-t px-6 py-5">
          <p className="text-ink text-xs font-medium">MeetFlow</p>
          <p className="text-muted mt-1 text-xs">Meetings that move work forward.</p>
        </div>
      </aside>

      <div className="md:pl-60">
        <header className="border-line sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-white/95 px-4 backdrop-blur sm:px-7">
          <div className="md:hidden">
            <Brand />
          </div>
          <div className="text-muted hidden text-sm md:block">
            Meeting intelligence, made actionable.
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-ink max-w-48 truncate text-sm font-medium">{profile.displayName}</p>
              <p className="text-muted max-w-48 truncate text-xs">{profile.email}</p>
            </div>
            <span
              aria-label={`Profile for ${profile.displayName}`}
              role="img"
              className="grid size-9 place-items-center rounded-full bg-[#e8edf2] text-xs font-semibold text-[#536273]"
            >
              {profile.displayName.trim().slice(0, 1).toUpperCase() || "M"}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="text-muted hover:text-ink focus-visible:ring-brand min-h-9 rounded-lg px-2 text-xs font-semibold focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60 sm:px-3 sm:text-sm"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </header>

        {signOutError ? (
          <p role="alert" className="mx-4 mt-3 text-right text-xs text-[#a53d45] sm:mx-7">
            {signOutError}
          </p>
        ) : null}

        <main
          id="main-content"
          className="mx-auto w-full max-w-6xl px-4 pt-7 pb-28 sm:px-7 sm:pt-9 md:pb-10 lg:px-10"
        >
          {children}
        </main>
      </div>

      <nav
        aria-label="Mobile navigation"
        className="border-line fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t bg-white px-1 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden"
      >
        {navigation.map((item) => (
          <NavigationLink key={item.href} item={item} pathname={pathname} mobile />
        ))}
      </nav>
    </div>
  );
}

function Brand({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/dashboard"
      className={`inline-flex items-center gap-2.5 ${className}`}
      aria-label="MeetFlow overview"
    >
      <span
        aria-hidden="true"
        className="bg-brand grid size-8 place-items-center rounded-[10px] text-white"
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none">
          <path
            d="M6 6.5h6a4 4 0 0 1 4 4v.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M18 17.5h-6a4 4 0 0 1-4-4V13"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="m13.5 8.5 3 2.5-3 2.5M10.5 10.5l-3 2.5 3 2.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="text-ink text-[17px] font-semibold tracking-[-0.04em]">MeetFlow</span>
    </Link>
  );
}

function NavigationLink({
  item,
  pathname,
  mobile = false,
}: {
  item: (typeof navigation)[number];
  pathname: string;
  mobile?: boolean;
}) {
  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={
        mobile
          ? `flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-medium ${isActive ? "text-brand" : "text-muted"}`
          : `flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${isActive ? "bg-brand-soft text-brand" : "text-muted hover:text-ink hover:bg-[#f6f8fa]"}`
      }
    >
      <NavigationIcon name={item.icon} active={isActive} />
      <span>{item.label}</span>
    </Link>
  );
}

function NavigationIcon({ name, active }: { name: string; active: boolean }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
    className: active ? "text-brand" : "",
  };

  let drawing: ReactNode;
  switch (name) {
    case "meetings":
      drawing = (
        <>
          <rect x="3.5" y="5" width="12" height="14" rx="3" />
          <path d="m16 10 4.5-2.5v9L16 14" />
        </>
      );
      break;
    case "tasks":
      drawing = (
        <>
          <rect x="4" y="4" width="16" height="16" rx="4" />
          <path d="m8 12 2.5 2.5L16.5 9" />
        </>
      );
      break;
    case "settings":
      drawing = (
        <>
          <circle cx="12" cy="12" r="3" />
          <path
            d="m19.4 15 .1.1a1.8 1.8 0 0 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3.1 1.3v.2a1.8 1.8 0 0 1-3.6 0v-.2a1.8 1.8 0 0 0-3.1-1.3l-.1.1a1.8 1.8 0 0 1-2.5-2.5l.1-.1a1.8 1.8 0 0 0-1.3-3.1h-.2a1.8 1.8 0 0 1 0-3.6h.2a1.8 1.8 0 0 0 1.3-3.1l-.1-.1a1.8 1.8 0 0 1 2.5-2.5l.1.1a1.8 1.8 0 0 0 3.1-1.3v-.2a1.8 1.8 0 0 1 3.6 0v.2a1.8 1.8 0 0 0 3.1 1.3l.1-.1a1.8 1.8 0 0 1 2.5 2.5l-.1.1a1.8 1.8 0 0 0 1.3 3.1h.2a1.8 1.8 0 0 1 0 3.6h-.2a1.8 1.8 0 0 0-1.3 3.1Z"
            transform="translate(1 1) scale(.9)"
          />
        </>
      );
      break;
    default:
      drawing = (
        <>
          <rect x="4" y="4" width="6" height="6" rx="1.5" />
          <rect x="14" y="4" width="6" height="6" rx="1.5" />
          <rect x="4" y="14" width="6" height="6" rx="1.5" />
          <rect x="14" y="14" width="6" height="6" rx="1.5" />
        </>
      );
  }

  return <svg {...common}>{drawing}</svg>;
}
