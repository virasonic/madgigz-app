"use client";

import Script from "next/script";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

// Cloudflare doesn't ship a typed SDK - this is the shape of the one global
// it attaches once api.js has loaded.
declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          theme?: "light" | "dark" | "auto";
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        }
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export interface TurnstileHandle {
  /** Call after a failed submit so the widget issues a fresh token to retry with. */
  reset: () => void;
}

interface TurnstileProps {
  siteKey: string;
  onVerify: (token: string) => void;
  onExpire?: () => void;
}

// Renders Cloudflare's widget and exposes reset() to the parent form - a
// verification failure or a stale (expired) token both need a fresh one
// before the fan/artist can retry, not a full page reload.
const Turnstile = forwardRef<TurnstileHandle, TurnstileProps>(function Turnstile(
  { siteKey, onVerify, onExpire },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  // Seed from whether Cloudflare's global is already on the page. On a re-mount
  // - e.g. the user went back to the role picker and returned - api.js is
  // already loaded, and next/script's onLoad does NOT fire a second time (it
  // early-returns on a LoadCache hit). Relying on onLoad alone left scriptLoaded
  // stuck false, so the widget never rendered and the form could never be
  // submitted (no token). Checking the global covers the already-loaded case.
  const [scriptLoaded, setScriptLoaded] = useState(
    () => typeof window !== "undefined" && Boolean(window.turnstile)
  );

  useImperativeHandle(ref, () => ({
    reset() {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
      }
    },
  }));

  useEffect(() => {
    if (!scriptLoaded || !containerRef.current || !window.turnstile) return;

    const widgetId = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      theme: "dark",
      callback: onVerify,
      "expired-callback": onExpire,
    });
    widgetIdRef.current = widgetId;

    return () => {
      if (window.turnstile) window.turnstile.remove(widgetId);
    };
    // onVerify/onExpire are stable enough in practice (defined once per form
    // mount) - re-rendering the widget on every parent re-render would reset
    // an in-progress or completed challenge for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scriptLoaded, siteKey]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        onLoad={() => setScriptLoaded(true)}
      />
      <div ref={containerRef} />
    </>
  );
});

export default Turnstile;
