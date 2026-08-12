"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface AppleButtonProps {
  /**
   * Which role the person picked on the landing page, when we know it. OAuth
   * carries no application state of its own, so it rides in the callback URL
   * and only ever becomes a default on the completion screen - never a decision
   * made on the person's behalf.
   */
  role?: "fan" | "artist";
  /** A shared event link they were heading for before signing in. */
  next?: string | null;
  label?: string;
}

// Apple's mark, inlined and monochrome so it takes the button's text colour on
// the dark theme. Same reasoning as the Google mark: the CSP blocks remote
// images, and no request should leave for Apple before anyone has agreed to
// anything.
function AppleMark() {
  return (
    <svg width="16" height="18" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

export default function AppleButton({ role, next, label = "Continue with Apple" }: AppleButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);

    const params = new URLSearchParams();
    if (role) params.set("role", role);
    if (next) params.set("next", next);
    const query = params.toString();

    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: {
        // Supabase bounces back to its own /auth/v1/callback first, then here.
        // This URL has to be on the allow-list in the Supabase dashboard, or
        // the round trip silently lands on the site root instead.
        redirectTo: `${window.location.origin}/auth/callback${query ? `?${query}` : ""}`,
      },
    });

    // On success the browser is already navigating to Apple, so there is
    // nothing to reset - only the failure path comes back here.
    if (oauthError) {
      console.error("signInWithOAuth (apple) failed:", oauthError.message);
      setError("Couldn't reach Apple just then. Try again?");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="flex w-full items-center justify-center gap-3 rounded-full border border-muted/40 bg-transparent px-6 py-4 font-display text-base tracking-wide text-foreground transition-colors duration-150 hover:border-foreground disabled:cursor-not-allowed disabled:border-muted/20 disabled:text-muted"
      >
        <AppleMark />
        {busy ? "Opening Apple..." : label}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
