"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Role } from "@/lib/types";
import { isArtistRole } from "@/lib/roles";
import { useT } from "@/lib/i18n/LocaleProvider";
import { useLiveUnreadCount } from "@/lib/realtime";
import { ExploreIcon, FeedIcon, NoteIcon, PersonIcon, TicketIcon } from "@/components/ui/nav-icons";

interface NavItem {
  href: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
}

export default function BottomNav({
  role,
  userId,
  unreadCount = 0,
}: {
  role: Role;
  userId: string;
  unreadCount?: number;
}) {
  const pathname = usePathname();
  const { t } = useT();
  // Seeded from the server-rendered count, then kept live so the dot appears
  // (and clears) without a reload as notifications arrive or are read (#101).
  const liveUnread = useLiveUnreadCount(userId, unreadCount);

  // The shell is h-screen (100vh, the *large* viewport that ignores the on-screen
  // keyboard), so when a field like Explore's search is focused, mobile browsers
  // scroll the whole column up to reveal it — dragging this bottom bar into
  // mid-screen. Hide it while the keyboard is open (visual viewport much shorter
  // than the layout viewport), the way native apps do. useState+useEffect, not
  // useSyncExternalStore (which broke here); setState only fires from the resize
  // event, never synchronously in the effect body.
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => setKeyboardOpen(vv.height < window.innerHeight - 120);
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  const items: NavItem[] = [
    { href: "/feed", label: t("nav.feed"), icon: FeedIcon },
    { href: "/explore", label: t("nav.explore"), icon: ExploreIcon },
    { href: "/saved", label: t("nav.tickets"), icon: TicketIcon },
    {
      href: "/profile",
      label: t("nav.profile"),
      icon: isArtistRole(role) ? NoteIcon : PersonIcon,
    },
  ];

  return (
    // pb-safe keeps the tabs above the iPhone home indicator when installed to
    // the home screen, where there's no browser chrome to sit behind. Hidden on
    // desktop (lg+), where SideNav takes over (#105).
    <nav
      className={`pb-safe sticky bottom-0 z-20 flex border-t border-muted/15 bg-background/95 backdrop-blur lg:hidden ${
        keyboardOpen ? "hidden" : ""
      }`}
    >
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`relative flex flex-1 flex-col items-center gap-1 py-3 text-xs ${
              active ? "text-primary" : "text-muted"
            }`}
          >
            <span className="relative">
              {item.icon(active)}
              {/* On the Profile tab because that's where the bell lives. Without
                  it, notifications only exist for someone who happens to open
                  their profile. */}
              {item.href === "/profile" && liveUnread > 0 && (
                <span
                  aria-label={`${liveUnread} unread notifications`}
                  className="absolute -right-1.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background"
                />
              )}
            </span>
            <span className="font-heading">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
