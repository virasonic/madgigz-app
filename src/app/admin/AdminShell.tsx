"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

// The admin panel stays English (it is not wired to the i18n catalog), so labels
// are plain strings here as elsewhere under /admin.
const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/artists", label: "Artists" },
  { href: "/admin/matches", label: "Matches" },
  { href: "/admin/events", label: "Events" },
  { href: "/admin/venues", label: "Venues" },
  { href: "/admin/billing", label: "Billing" },
  { href: "/admin/payouts", label: "Payouts" },
  { href: "/admin/discounts", label: "Discounts" },
  { href: "/admin/feedback", label: "Feedback" },
  { href: "/admin/moderation", label: "Moderation" },
  { href: "/admin/decisions", label: "Decisions" },
  { href: "/admin/announcements", label: "Announcements" },
];

function isActive(pathname: string, href: string): boolean {
  // Every route is under /admin, so the dashboard must match exactly or it would
  // read as active on every page.
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Nav pills styled like the app's SideNav (#162 feedback: "fit the vibe of the
// MadGigz app") - rounded-2xl, orange text-primary on surface when active.
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
      <Image src="/logos/madgigz-wordmark.png" alt="MadGigz" width={148} height={47} className="w-28" priority />
      <span className="font-heading text-[10px] uppercase tracking-widest text-muted">Admin</span>
    </div>
  );
}

// #162: the admin panel was a fixed 240px sidebar sitting next to the content,
// which on a phone squeezed every table and stat card into a sliver. The sidebar
// now shows only from lg up; below that it collapses into a hamburger drawer, and
// the content gets the full width. Split out as a client component (the drawer
// needs state) while layout.tsx keeps the server-side auth gate.
export default function AdminShell({
  username,
  children,
}: {
  username: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the drawer whenever the route changes, so tapping a link doesn't leave
  // it hanging open over the new page. Adjust-state-during-render (not an effect)
  // because Next 16's lint bans a synchronous setState in an effect body.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setDrawerOpen(false);
  }

  const footer = (
    <div className="mt-auto flex flex-col gap-2 pt-6 text-xs text-muted">
      <span>Signed in as {username}</span>
      <Link href="/feed" className="text-accent">
        Back to app
      </Link>
    </div>
  );

  return (
    // Lock the shell to the viewport so the content area scrolls, not the whole
    // page: that keeps the header/sidebar frozen (#162 feedback) and, with main
    // clipping its x-axis, kills the whole-page side scroll — every wide table
    // scrolls inside its own overflow-x-auto box instead (the Users-tab feel Vir
    // liked). h-dvh tracks the mobile browser chrome.
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      {/* Desktop sidebar (lg+) */}
      <aside className="hidden w-60 shrink-0 flex-col overflow-y-auto border-r border-muted/15 px-3 py-5 lg:flex">
        <Link href="/feed" className="mb-6 px-2" aria-label="MadGigz Admin">
          <Wordmark />
        </Link>
        <NavLinks pathname={pathname} />
        {footer}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar (below lg) - a shrink-0 sibling above the scroll area,
            so it's frozen while main scrolls; pt-safe-page clears the notch. */}
        <header className="pt-safe-page flex shrink-0 items-center gap-3 border-b border-muted/15 bg-background px-4 pb-3 lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open admin menu"
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

      {/* Mobile drawer */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Admin menu"
        >
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawerOpen(false)} />
          <aside className="pt-safe-page relative flex w-64 max-w-[80%] flex-col overflow-y-auto border-r border-muted/15 bg-background px-3 pb-6">
            <div className="mb-6 flex items-start justify-between gap-2 px-2">
              <Wordmark />
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close admin menu"
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
