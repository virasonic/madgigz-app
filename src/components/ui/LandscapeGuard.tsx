"use client";

import { useT } from "@/lib/i18n/LocaleProvider";

// Shown only in phone-landscape (visibility is driven purely by the
// `.landscape-guard` media query in globals.css, so there's no matchMedia
// flicker on load). The app is a portrait mobile column; sideways on a phone it
// breaks, and a web app can't lock device rotation the way a native app can, so
// we prompt the user to turn back. Mounted once in the (app) shell.
export default function LandscapeGuard() {
  const { t } = useT();
  return (
    <div className="landscape-guard">
      <div className="flex max-w-xs flex-col items-center gap-3 px-8 text-center">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="7" y="2" width="10" height="20" rx="2" stroke="currentColor" strokeWidth="1.6" className="text-foreground" />
          <path d="M11 19h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="text-foreground" />
          <path d="M3 9a9 9 0 0 1 3-4M21 15a9 9 0 0 1-3 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="text-accent" />
        </svg>
        <p className="font-display text-xl text-foreground">{t("orientation.title")}</p>
        <p className="text-sm text-muted">{t("orientation.body")}</p>
      </div>
    </div>
  );
}
