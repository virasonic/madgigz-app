"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Role } from "@/lib/types";
import { isArtistRole } from "@/lib/roles";
import { useT } from "@/lib/i18n/LocaleProvider";
import { useLiveUnreadCount } from "@/lib/realtime";
import { BellIcon, ExploreIcon, FeedIcon, NoteIcon, PersonIcon, ShieldIcon, TicketIcon } from "@/components/ui/nav-icons";

interface NavItem {
  href: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
  /** Unread count, shown as a pill. Only the Notifications row uses it. */
  badge?: number;
}

// The desktop counterpart to BottomNav (#105): a persistent left rail, TikTok-web
// style. Hidden below lg, where the bottom nav takes over. Shares its icons and
// active-state logic with BottomNav so the two can't drift.
export default function SideNav({
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
  const liveUnread = useLiveUnreadCount(userId, unreadCount);

  const items: NavItem[] = [
    { href: "/feed", label: t("nav.feed"), icon: FeedIcon },
    { href: "/explore", label: t("nav.explore"), icon: ExploreIcon },
    { href: "/saved", label: t("nav.tickets"), icon: TicketIcon },
    { href: "/notifications", label: t("notifications.title"), icon: BellIcon, badge: liveUnread },
    { href: "/profile", label: t("nav.profile"), icon: isArtistRole(role) ? NoteIcon : PersonIcon },
  ];

  // Admins get a link straight to the web admin panel, under Profile. Desktop
  // only (this whole rail is), and the /admin routes are gated server-side by
  // requireAdmin regardless, so this is a convenience shortcut, not the control.
  // Label stays English on purpose — the admin panel is English-only by design.
  if (role === "admin") {
    items.push({ href: "/admin", label: "Admin panel", icon: ShieldIcon });
  }

  return (
    <nav className="hidden lg:flex lg:w-60 lg:shrink-0 lg:flex-col lg:gap-1 lg:border-r lg:border-muted/15 lg:px-3 lg:py-5">
      <Link href="/feed" className="mb-4 px-3" aria-label="MadGigz">
        <Image src="/logos/madgigz-wordmark.png" alt="MadGigz" width={148} height={47} priority />
      </Link>

      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-heading transition-colors ${
              active
                ? "bg-surface text-primary"
                : "text-muted hover:bg-surface/60 hover:text-foreground"
            }`}
          >
            {item.icon(active)}
            <span>{item.label}</span>
            {item.badge ? (
              <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-foreground">
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
