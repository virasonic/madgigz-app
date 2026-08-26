"use client";

import { useEffect } from "react";
import { NATIVE_AUTH_REDIRECT, isNativeApp } from "@/lib/native";

// Native-shell wiring, mounted app-wide from the root layout so it's listening
// whichever screen a sign-in was started from. A complete no-op on the web.
//
// Two jobs:
//  1. OAuth return trip - the system browser (opened by startOAuth) redirects to
//     madgigz://auth-callback?code=...&role=...&next=... . We dismiss the browser
//     sheet and forward that query to the site's own /auth/callback inside the
//     webview, where the existing server route finishes the exchange and routes
//     the user. No auth logic is duplicated here.
//  2. Startup chrome - hide the splash once web content is up and set a light
//     status bar for the near-black canvas.
export default function NativeBridge() {
  useEffect(() => {
    if (!isNativeApp()) return;
    // Mark the document as the native shell so globals.css can disable text
    // selection / the long-press callout app-wide (native feel). Scoped here so
    // the plain web/PWA is untouched. The main app is served remotely, so this
    // ships with a normal web deploy — no native rebuild needed.
    document.documentElement.classList.add("native-app");
    let removeListener: (() => void) | undefined;

    (async () => {
      const { App } = await import("@capacitor/app");
      const { Browser } = await import("@capacitor/browser");
      const { SplashScreen } = await import("@capacitor/splash-screen");
      const { StatusBar, Style } = await import("@capacitor/status-bar");

      // Light content (white text) reads against the #0a0807 background.
      // (Android status/nav-bar insets are handled natively in MainActivity so
      // they apply uniformly across every screen - see the WindowInsets padding
      // there; iOS uses env(safe-area-inset-*) in globals.css.)
      StatusBar.setStyle({ style: Style.Light }).catch(() => {});
      SplashScreen.hide().catch(() => {});

      const sub = await App.addListener("appUrlOpen", ({ url }) => {
        if (!url.startsWith(NATIVE_AUTH_REDIRECT)) return;
        Browser.close().catch(() => {});
        const query = url.split("?")[1] ?? "";
        // A full document navigation is intentional: /auth/callback is a server
        // Route Handler that exchanges the code, sets the session cookie and
        // redirects onward - router.push() wouldn't hit it. So the lint rule
        // (meant for navigating between Next pages) doesn't apply here.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = `${window.location.origin}/auth/callback${
          query ? `?${query}` : ""
        }`;
      });
      removeListener = () => sub.remove();
    })();

    return () => removeListener?.();
  }, []);

  return null;
}
