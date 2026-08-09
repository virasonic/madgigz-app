"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppNotification, describeNotification } from "@/lib/notifications";
import { markNotificationsRead } from "./actions";

function timeAgo(iso: string, now: number) {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function NotificationsClient({
  initialNotifications,
  now,
}: {
  initialNotifications: AppNotification[];
  // Passed in from the server rather than read during render. Calling
  // Date.now() here would be an impure render, and setting it in an effect
  // trips react-hooks/set-state-in-effect; a serialised prop hydrates to the
  // same value on both sides, so there's no mismatch either. The cost is that
  // "5m ago" doesn't tick while the screen sits open, which nobody minds.
  now: number;
}) {
  const router = useRouter();
  const [notifications] = useState(initialNotifications);

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
        <h1 className="font-display mb-6 text-2xl text-foreground">Notifications</h1>
        <p className="text-sm text-muted">
          Nothing yet. You&apos;ll hear when an artist you follow announces a show, when
          someone follows you, or when one of your gigs is coming up.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="font-display mb-6 text-2xl text-foreground">Notifications</h1>

      <div className="flex flex-col gap-2">
        {notifications.map((n) => {
          const { title, detail } = describeNotification(n);
          const body = (
            <>
              <div className="flex items-start justify-between gap-3">
                <p className="font-heading text-sm text-foreground">{title}</p>
                {!n.readAt && (
                  <span
                    aria-label="Unread"
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"
                  />
                )}
              </div>
              {detail && <p className="mt-0.5 text-xs text-muted">{detail}</p>}
              <p className="mt-1 text-[11px] text-muted">
                {timeAgo(n.createdAt, now)}
              </p>
            </>
          );

          // Only the ones tied to a show go anywhere. "X started following you"
          // has no page worth opening - a dead tap is worse than none.
          return n.eventId ? (
            <button
              key={n.id}
              onClick={() => router.push(`/e/${n.eventId}`)}
              className="rounded-2xl bg-surface p-3.5 text-left"
            >
              {body}
            </button>
          ) : (
            <div key={n.id} className="rounded-2xl bg-surface p-3.5">
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
