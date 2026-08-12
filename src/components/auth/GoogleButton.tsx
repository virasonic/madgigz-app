"use client";

import { useState } from "react";
import { isNativeApp, startOAuth } from "@/lib/native";

interface GoogleButtonProps {
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

// Google's mark, inlined. The CSP on this app blocks remote images anyway, and
// a <img src="google.com/..."> in the auth screen is a request to Google on
// every page view by someone who has not agreed to anything yet.
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

export default function GoogleButton({ role, next, label = "Continue with Google" }: GoogleButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);

    const params = new URLSearchParams();
    if (role) params.set("role", role);
    if (next) params.set("next", next);
    const query = params.toString();

    // The redirectTo must be on the allow-list in the Supabase dashboard, or the
    // round trip silently lands on the site root. In the native app startOAuth
    // ignores this and uses the deep-link scheme instead (see native.ts).
    const webRedirectTo = `${window.location.origin}/auth/callback${query ? `?${query}` : ""}`;
    const oauthError = await startOAuth("google", webRedirectTo, query);

    if (oauthError) {
      console.error("signInWithOAuth failed:", oauthError);
      setError("Couldn't reach Google just then. Try again?");
      setBusy(false);
    } else if (isNativeApp()) {
      // Native: control returns here once the system browser is presented, so
      // reset the button - the sign-in completes later via the deep link, and a
      // stuck spinner would strand anyone who dismisses the sheet. On the web the
      // page is already navigating to Google, so there's nothing to reset.
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
        <GoogleMark />
        {busy ? "Opening Google..." : label}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
