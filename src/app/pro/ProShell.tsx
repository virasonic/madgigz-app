"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ProAccountType, proTypeLabel } from "@/lib/pro";

// The pro panel stays English, for the same reason /admin does: it is a
// desktop back-office tool for business accounts, not a fan-facing surface, and
// wiring it to the i18n catalog would double every string in the app's typed
// message set for an audience that has never asked for it. Revisit if MadGigz
// signs a promoter who wants it in Spanish.
const NAV_ITEMS = [
  { href: "/pro", label: "Dashboard" },
  { href: "/pro/events", label: "Events" },
  { href: "/pro/payouts", label: "Payouts" },
];

function isActive(pathname: string, href: string): boolean {
  // Everything lives under /pro, so the dashboard has to match exactly or it
  // reads as active on every page.
  if (href === "/pro") return pathname === "/pro";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          aria-current={isActive(pathname, item.href) ? "page" : undefined}
          className={`rounded-2xl px-3 py-2.5 text-sm font-heading transition-colors ${
            isActive(pathname, item.href)
              ? "bg-surface text-primary"
              : "text-muted hover:bg-surface/60 hover:text-foreground"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function Wordmark() {
  return (
    <div className="flex items-center gap-2">
      <Image
        src="/logos/madgigz-wordmark.png"
        alt="MadGigz"
        width={148}
        height={47}
        className="w-28"
        priority
      />
      <span className="font-heading text-[10px] uppercase tracking-widest text-muted">Pro</span>
    </div>
  );
}

// Structurally the same shell as AdminShell: a viewport-locked frame so the
// sidebar stays put while the content scrolls, and wide tables scroll inside
// their own box instead of dragging the whole page sideways. Deliberately a
// copy rather than a shared component - the two panels have different nav,
// different footers and different audiences, and the first time one needs to
// diverge a shared abstraction would be in the way.
export default function ProShell({
  displayName,
  type,
  children,
}: {
  displayName: string;
  type: ProAccountType;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the drawer when the route changes. Adjust-state-during-render rather
  // than an effect: Next 16's lint bans a synchronous setState in an effect.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setDrawerOpen(false);
  }

  const footer = (
    <div className="mt-auto flex flex-col gap-2 pt-6 text-xs text-muted">
      <span className="text-foreground">{displayName}</span>
      <span>{proTypeLabel(type)} account</span>
      <Link href="/feed" className="text-accent">
        Back to app
      </Link>
    </div>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      {/* Desktop sidebar (lg+). The panel is desktop-first by design - a
          promoter works from a laptop - but it still has to be usable on a
          phone at the door, hence the drawer below. */}
      <aside className="hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-muted/15 px-3 py-5 lg:flex">
        <Link href="/feed" className="mb-6 px-2" aria-label="MadGigz Pro">
          <Wordmark />
        </Link>
        <NavLinks pathname={pathname} />
        {footer}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="pt-safe-page flex shrink-0 items-center gap-3 border-b border-muted/15 bg-background px-4 pb-3 lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open pro menu"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-foreground"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <Wordmark />
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-8">{children}</main>
      </div>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Pro menu"
        >
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
          <aside className="pt-safe-page relative flex w-64 max-w-[80%] flex-col overflow-y-auto border-r border-muted/15 bg-background px-3 pb-6">
            <div className="mb-6 flex items-start justify-between gap-2 px-2">
              <Wordmark />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close pro menu"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-muted hover:text-foreground"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <NavLinks pathname={pathname} onNavigate={() => setDrawerOpen(false)} />
            {footer}
          </aside>
        </div>
      )}
    </div>
  );
}
