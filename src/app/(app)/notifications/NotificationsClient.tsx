"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppNotification, describeGroup, groupNotifications, Translate } from "@/lib/notifications";
import { markNotificationsRead } from "./actions";
import BackButton from "@/components/ui/BackButton";
import { useT } from "@/lib/i18n/LocaleProvider";
import { dateLocale } from "@/lib/dates";

function timeAgo(iso: string, now: number, t: Translate, dl: string) {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (mins < 1) return t("notifications.justNow");
  if (mins < 60) return t("notifications.minsAgo", { mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("notifications.hoursAgo", { hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("notifications.daysAgo", { days });
  return new Date(iso).toLocaleDateString(dl, { day: "numeric", month: "short" });
}

export default function NotificationsClient({
  initialNotifications,
  now,
  isArtist,
}: {
  initialNotifications: AppNotification[];
  // Only artists get followers or get put on a bill, so promising a fan those
  // things describes an app they aren't using.
  isArtist: boolean;
  // Passed in from the server rather than read during render. Calling
  // Date.now() here would be an impure render, and setting it in an effect
  // trips react-hooks/set-state-in-effect; a serialised prop hydrates to the
  // same value on both sides, so there's no mismatch either. The cost is that
  // "5m ago" doesn't tick while the screen sits open, which nobody minds.
  now: number;
}) {
  const { t, locale } = useT();
  const dl = dateLocale(locale);
  const router = useRouter();
  const [notifications] = useState(initialNotifications);
  const groups = useMemo(() => groupNotifications(notifications), [notifications]);

  // Opening the screen is the act of reading them. Marking on mount rather than
  // per-row means the badge clears when you'd expect it to, instead of counting
  // down as you tap each one.
  useEffect(() => {
    const unread = initialNotifications.filter((n) => !n.readAt).map((n) => n.id);
    if (unread.length === 0) return;
    markNotificationsRead(unread).then(() => router.refresh());
  }, [initialNotifications, router]);

  if (notifications.length === 0) {
    return (
      <div className="p-4">
        <div className="mb-6 flex items-center gap-3">
          <BackButton href="/profile" />
          <h1 className="font-display text-2xl text-foreground">{t("notifications.title")}</h1>
        </div>
        <p className="text-sm text-muted">
          {isArtist ? t("notifications.emptyArtist") : t("notifications.emptyFan")}
        </p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-6 flex items-center gap-3">
        <BackButton href="/profile" />
        <h1 className="font-display text-2xl text-foreground">{t("notifications.title")}</h1>
      </div>

      <div className="flex flex-col gap-2">
        {groups.map((g) => {
          const { title, detail } = describeGroup(g, t);
          const n = g.latest;
          const body = (
            <>
              <div className="flex items-start justify-between gap-3">
                <p className="font-heading text-sm text-foreground">{title}</p>
                {g.unread && (
                  <span
                    aria-label={t("notifications.unread")}
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"
                  />
                )}
              </div>
              {detail && <p className="mt-0.5 text-xs text-muted">{detail}</p>}
              <p className="mt-1 text-[11px] text-muted">
                {timeAgo(n.createdAt, now, t, dl)}
              </p>
            </>
          );

          // Only the ones tied to a show go anywhere. "X started following you"
          // has no page worth opening - a dead tap is worse than none.
          return n.eventId ? (
            <button
              key={g.key}
              onClick={() => router.push(`/e/${n.eventId}`)}
              className="rounded-2xl bg-surface p-3.5 text-left"
            >
              {body}
            </button>
          ) : (
            <div key={g.key} className="rounded-2xl bg-surface p-3.5">
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
