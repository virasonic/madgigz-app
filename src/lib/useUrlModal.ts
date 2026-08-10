"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useRef } from "react";

/**
 * Drives an open/closed sheet from a URL query param instead of local state, so
 * three things start working for free (this is #102):
 *
 *   - the phone/browser back button closes the sheet instead of leaving the page
 *   - the open state survives a refresh
 *   - the URL can be shared or deep-linked straight to the open sheet
 *
 * We use the native History API rather than `router.push`, which Next patches to
 * feed back into `useSearchParams` (see the "Native History API" note in
 * node_modules/next/dist/docs/.../04-linking-and-navigating.md). That keeps the
 * update shallow: the server component doesn't re-run and the scroll position is
 * left alone - opening a ticket sheet must not jump the feed.
 *
 * Opening pushes a history entry; closing mirrors it with `history.back()` so the
 * entry is popped cleanly and the two buttons behave identically. The one case
 * that can't go back is a *deep link* - someone landed on `?ticket=x` directly,
 * so there is no entry of ours to pop and `back()` would walk them off the site.
 * `pushedRef` tracks that: false on a fresh mount, so close falls back to
 * `replaceState`, which strips the param in place.
 */
export function useUrlModal(key: string) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = searchParams.get(key);
  const isOpen = value !== null;

  // True only for entries this hook pushed during the session. A deep link or a
  // refresh leaves it false, which is exactly when close() must not go back.
  const pushedRef = useRef(false);

  const urlFor = useCallback(
    (params: URLSearchParams) => {
      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname],
  );

  const open = useCallback(
    (paramValue: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const alreadyOpen = params.get(key) !== null;
      params.set(key, paramValue);
      // Switching value while already open (rare) replaces rather than stacks a
      // second entry, so one back press still closes it.
      if (alreadyOpen) {
        window.history.replaceState(null, "", urlFor(params));
      } else {
        window.history.pushState(null, "", urlFor(params));
        pushedRef.current = true;
      }
    },
    [key, searchParams, urlFor],
  );

  const close = useCallback(() => {
    if (searchParams.get(key) === null) return;
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
    } else {
      const params = new URLSearchParams(searchParams.toString());
      params.delete(key);
      window.history.replaceState(null, "", urlFor(params));
    }
  }, [key, searchParams, urlFor]);

  return { value, isOpen, open, close };
}
