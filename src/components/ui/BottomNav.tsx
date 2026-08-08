"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Role } from "@/lib/types";

interface NavItem {
  href: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
}

function FeedIcon(active: boolean) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 11.5 12 4l8 7.5M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9"
        stroke="currentColor"
        strokeWidth={active ? 2.4 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExploreIcon(active: boolean) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect
        x="3.5"
        y="3.5"
        width="7"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth={active ? 2.4 : 1.8}
      />
      <rect
        x="13.5"
        y="3.5"
        width="7"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth={active ? 2.4 : 1.8}
      />
      <rect
        x="3.5"
        y="13.5"
        width="7"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth={active ? 2.4 : 1.8}
      />
      <rect
        x="13.5"
        y="13.5"
        width="7"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth={active ? 2.4 : 1.8}
      />
    </svg>
  );
}

function TicketIcon(active: boolean) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M3.375 5.25c-.62 0-1.125.504-1.125 1.125v3.026a3 3 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a3 3 0 0 1 0-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375Z"
        stroke="currentColor"
        strokeWidth={active ? 2.4 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18"
        stroke="currentColor"
        strokeWidth={active ? 2.4 : 1.8}
        strokeLinecap="round"
      />
    </svg>
  );
}

function PersonIcon(active: boolean) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth={active ? 2.4 : 1.8} />
      <path
        d="M4.5 20c1.3-3.5 4.3-5.5 7.5-5.5s6.2 2 7.5 5.5"
        stroke="currentColor"
        strokeWidth={active ? 2.4 : 1.8}
        strokeLinecap="round"
      />
    </svg>
  );
}

function NoteIcon(active: boolean) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="8" cy="17" r="3" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 2.4 : 1.8} />
      <circle cx="16" cy="14" r="3" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 2.4 : 1.8} />
      <path
        d="M11 17V5l8-2v10"
        stroke="currentColor"
        strokeWidth={active ? 2.4 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function BottomNav({ role }: { role: Role }) {
  const pathname = usePathname();

  const items: NavItem[] = [
    { href: "/feed", label: "Feed", icon: FeedIcon },
    { href: "/explore", label: "Explore", icon: ExploreIcon },
    { href: "/saved", label: "Tickets", icon: TicketIcon },
    {
      href: "/profile",
      label: "Profile",
      icon: role === "artist" ? NoteIcon : PersonIcon,
    },
  ];

  return (
    // pb-safe keeps the tabs above the iPhone home indicator when installed to
    // the home screen, where there's no browser chrome to sit behind.
    <nav className="pb-safe sticky bottom-0 z-20 flex border-t border-muted/15 bg-background/95 backdrop-blur">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-1 py-3 text-xs ${
              active ? "text-primary" : "text-muted"
            }`}
          >
            {item.icon(active)}
            <span className="font-heading">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
