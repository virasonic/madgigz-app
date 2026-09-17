"use client";

import { useEffect } from "react";
import { captureAttribution, recordSignupAttribution } from "@/lib/attribution";

// Mounted once in the root layout, which is the only place that sees every
// route an ad click can touch.
//
// It has to be the root layout rather than the signup screen, because there is
// no single screen every new account passes through:
//   * email signup goes /signup -> verify-email -> /auth/confirm -> /feed,
//     never touching /signup/complete-profile;
//   * Google/Apple signup does stop at complete-profile, to pick a username;
//   * an artist lands on /signup/artist-profile and may sit there for days.
// Hooking any one of those misses the others - which it did, until this moved.
//
// Two jobs per load, both cheap: remember a campaign if the URL names one, and
// hand any pending click to the account once one exists. `recordSignupAttribution`
// returns immediately when there is nothing pending, so a normal page load makes
// no extra request.
//
// Reads `window.location.search` directly rather than `useSearchParams()`: that
// hook opts the whole subtree into client-side rendering and needs a Suspense
// boundary, which is a lot of machinery for a one-shot read that renders nothing.
export default function AttributionCapture() {
  useEffect(() => {
    captureAttribution();
    void recordSignupAttribution();
  }, []);

  return null;
}
