"use client";

import { useEffect } from "react";

// Registers the service worker (public/sw.js) so the app is installable and has
// an offline fallback (#110). Production only: in dev a caching SW just serves
// stale bundles and muddies debugging. Runs after load so it never competes
// with the initial render. Failures are swallowed - the SW is an enhancement,
// never a requirement for the app to work.
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    };

    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
