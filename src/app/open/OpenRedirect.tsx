"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { isNativeApp } from "@/lib/native";

// Tries to open the installed native app via the madgigz:// scheme, then falls
// back to the web app at /feed if it didn't take over. Kept deliberately
// wordless (just the wordmark + a spinner) so it needs no translated copy and
// reads the same in every language during its ~1s on screen.
export default function OpenRedirect() {
  useEffect(() => {
    const webApp = `${window.location.origin}/feed`;

    // Already inside the native shell (someone navigated here in-app) — don't
    // bounce the scheme at ourselves, just go home.
    if (isNativeApp()) {
      window.location.replace(webApp);
      return;
    }

    const start = Date.now();

    // Ask the OS to open the app. If it's installed the OS takes over and this
    // tab is backgrounded (visibilitychange fires); if not, nothing happens and
    // the timer below sends the visitor to the web app instead.
    try {
      window.location.href = "madgigz://open";
    } catch {
      /* scheme not handled — the fallback timer covers it */
    }

    const timer = window.setTimeout(() => {
      // Still here and visible ⇒ the app didn't open ⇒ fall through to the web.
      // The elapsed guard avoids a late redirect if the tab was merely throttled
      // in the background while the app was launching.
      if (document.visibilityState === "visible" && Date.now() - start < 2500) {
        window.location.replace(webApp);
      }
    }, 1200);

    // The app opened: cancel the web fallback so returning to Safari later
    // doesn't yank the visitor to /feed.
    const cancelOnHide = () => {
      if (document.visibilityState === "hidden") window.clearTimeout(timer);
    };
    document.addEventListener("visibilitychange", cancelOnHide);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", cancelOnHide);
    };
  }, []);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 py-24">
      {/* Tapping the wordmark is the manual fallback if the auto-redirect is
          blocked; alt text keeps it accessible without any translated string. */}
      <Link href="/feed" aria-label="MadGigz">
        <Image
          src="/logos/madgigz-wordmark.png"
          alt="MadGigz"
          width={280}
          height={89}
          priority
          className="w-48"
        />
      </Link>
      <div
        className="size-7 animate-spin rounded-full border-2 border-surface-raised border-t-foreground"
        role="status"
        aria-label="MadGigz"
      />
    </div>
  );
}
