"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { eventPath, parseEventPath, type EventLinkTarget } from "@/lib/event-url";

/**
 * Drives the ticket sheet from the URL the way useUrlModal does (#102) - back
 * closes it, a refresh keeps you on the show, the link is shareable - except
 * the URL is the show's own /event/yyyy/mm/dd/<slug> path (#237) rather than
 * ?ticket=<uuid>, so the address bar shows the same link the Share button
 * hands out.
 *
 * It works without leaving the screen: src/app/(app)/@modal/(...)event/... is
 * an intercepting route that claims /event/... for soft navigations made inside
 * the app shell. Its page renders nothing; it exists so the URL is a legitimate
 * destination that keeps the current screen mounted in the `children` slot. The
 * screen reads the pathname, finds the show among the events it already holds
 * and renders TicketModal with its own state (saved ids, guest gate), exactly
 * as before. A hard load of the same URL is not intercepted and gets the full
 * public event page.
 *
 * Why not history.pushState with the pretty path, as useUrlModal does with a
 * query param: a Server Action posts to the router's current URL and, when it
 * revalidates, the client navigates there to pick up the new data. With the
 * URL rewritten under Next's feet, claiming a free ticket or sending the show
 * to a friend would swap the whole screen for the public event page. Going
 * through the router keeps the tree and the URL in agreement.
 *
 * ?ticket=<uuid> on a list page (links copied before #237) still opens the
 * sheet, and closing it strips the param in place, as useUrlModal did.
 */
export function useEventSheet<T extends EventLinkTarget>(events: readonly T[]) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  const slug = slugFromPathname(pathname);
  const legacyId = searchParams.get("ticket");

  // The show just tapped, held until the navigation lands and the pathname
  // names it - so the sheet opens on the tap, not a network round trip later.
  // Cleared during render once the URL has caught up (adjust-state-during-
  // render, not an effect).
  const [pendingId, setPendingId] = useState<string | null>(null);
  if (
    pendingId !== null &&
    slug !== null &&
    events.some((e) => e.id === pendingId && e.slug === slug)
  ) {
    setPendingId(null);
  }

  const active = useMemo<T | null>(() => {
    if (pendingId !== null) return events.find((e) => e.id === pendingId) ?? null;
    if (slug !== null) return events.find((e) => e.slug === slug) ?? null;
    if (legacyId !== null) return events.find((e) => e.id === legacyId) ?? null;
    return null;
  }, [events, pendingId, slug, legacyId]);

  const open = useCallback(
    (event: T) => {
      setPendingId(event.id);
      // scroll: false - opening a sheet must not jump the feed (#102).
      router.push(eventPath(event), { scroll: false });
    },
    [router]
  );

  const close = useCallback(() => {
    setPendingId(null);
    if (slug !== null) {
      // The only way this screen is mounted under an /event/... URL is a push
      // of ours (or the forward button re-entering it), so the entry below is
      // this screen. back() pops it - the same thing the hardware button does.
      router.back();
      return;
    }
    if (legacyId !== null) {
      // A ?ticket= deep link has no entry of ours to pop; strip it in place.
      const params = new URLSearchParams(searchParams.toString());
      params.delete("ticket");
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    }
  }, [slug, legacyId, pathname, searchParams, router]);

  return { active, open, close };
}

/** The slug named by an in-app /event/yyyy/mm/dd/<slug> pathname, else null. */
function slugFromPathname(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "event") return null;
  return parseEventPath(parts.slice(1))?.slug ?? null;
}
