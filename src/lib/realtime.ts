"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchUnreadCount } from "@/lib/notifications";

// Live updates (#101). Nothing on the app used to move without a reload; these
// two hooks push the only two numbers that actually mislead someone when they
// go stale - the unread bell and a show's sold/sold-out state - straight to the
// browser over Supabase Realtime. Everything else still refetches on its own
// schedule; this is deliberately narrow.
//
// Realtime membership for these tables is granted in addendum_033, and RLS
// still applies, so a subscriber only receives changes for rows it may already
// read. If that migration hasn't run yet the channel simply never fires and the
// server-rendered value stands - the feature degrades to "reload to refresh",
// exactly today's behaviour, rather than breaking.

// The bell. Seeded from the server-rendered count so there's no flash, then
// kept live: any insert/update/delete on the caller's own notifications
// triggers a fresh count. We re-count rather than track a delta because a
// "mark all read" fires a burst of updates at once and a running tally would
// drift - a single authoritative count query is both simpler and correct. The
// query is debounced so that burst collapses into one round-trip.
export function useLiveUnreadCount(userId: string, initial: number): number {
  const [count, setCount] = useState(initial);
  // A fresh server render (e.g. a full navigation that re-runs the layout) can
  // hand down a newer seed; adopt it rather than clinging to the first value.
  // React's "adjust state during render" pattern - not an effect - so it's
  // synchronous and doesn't trigger a second commit.
  const [seenSeed, setSeenSeed] = useState(initial);
  if (initial !== seenSeed) {
    setSeenSeed(initial);
    setCount(initial);
  }

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const recount = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        setCount(await fetchUnreadCount(supabase, userId));
      }, 300);
    };

    (async () => {
      // notifications is RLS-scoped to the recipient, so the realtime socket
      // has to carry this user's JWT or the server sends it nothing. The SSR
      // browser client keeps the session in cookies and doesn't reliably push
      // it to the websocket before we subscribe, so set it explicitly first -
      // this is the fix for "the bell only updated when I changed pages".
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);

      channel = supabase
        .channel(`notif-count-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `recipient_id=eq.${userId}`,
          },
          recount
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId]);

  return count;
}

// A single show's sold count, kept live while a sheet that shows it is open.
// Seeded from the event the caller already has, then updated whenever that one
// row's `sold` (or `capacity`) changes - so the progress bar, "Almost gone" and
// the sold-out lock react as other people buy, without the fan reloading.
// `enabled` lets the caller subscribe only while the modal is actually open.
export function useLiveEventStats(
  eventId: string,
  initial: { sold: number; capacity: number },
  enabled: boolean
): { sold: number; capacity: number } {
  const [stats, setStats] = useState(initial);

  // Re-seed when the sheet switches to a different event, via React's "adjust
  // state during render" pattern rather than an effect - so the reset is
  // synchronous and doesn't churn the subscription below.
  const [seenEvent, setSeenEvent] = useState(eventId);
  if (eventId !== seenEvent) {
    setSeenEvent(eventId);
    setStats(initial);
  }

  useEffect(() => {
    if (!enabled || !eventId) return;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      // events is publicly readable, so an anon socket would receive this
      // anyway - but a signed-in fan's socket should carry their token for
      // consistency with the bell, and it's harmless for the public read.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);

      channel = supabase
        .channel(`event-stats-${eventId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "events",
            filter: `id=eq.${eventId}`,
          },
          (payload) => {
            const row = payload.new as { sold?: number; capacity?: number };
            setStats((prev) => ({
              sold: typeof row.sold === "number" ? row.sold : prev.sold,
              capacity: typeof row.capacity === "number" ? row.capacity : prev.capacity,
            }));
          }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [eventId, enabled]);

  return stats;
}
