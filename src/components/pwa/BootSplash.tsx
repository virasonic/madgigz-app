"use client";

import { useEffect, useState } from "react";

// Boot splash. The native TWA/PWA splash shows the mark, then hands off to the
// web app — but the (app) layout awaits Supabase auth + profile before anything
// paints, leaving a few seconds of black canvas that reads as a broken launch.
// This is server-rendered into the very first paint (the root layout only reads
// a cookie, so it streams immediately), covers that gap with the brand mark, and
// fades out once the shell is interactive.
//
// It lives in the ROOT layout, which persists across client navigations, so it
// shows only on a hard load (app launch / refresh) — never when moving between
// tabs in-app. The icon is /icons/icon-192.png, which the service worker
// precaches, so the splash still has its logo when the app is launched offline.
export default function BootSplash() {
  const [hidden, setHidden] = useState(false);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    // Fade once hydrated (≈ the shell is interactive and content has streamed
    // in), then unmount after the transition so it never traps a tap.
    const raf = requestAnimationFrame(() => setHidden(true));
    const timer = setTimeout(() => setRemoved(true), 600);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, []);

  if (removed) return null;

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-background transition-opacity duration-500 ${
        hidden ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- precached static icon, no layout shift */}
      <img
        src="/icons/icon-192.png"
        alt=""
        width={96}
        height={96}
        className="h-24 w-24 animate-pulse rounded-3xl"
      />
    </div>
  );
}
