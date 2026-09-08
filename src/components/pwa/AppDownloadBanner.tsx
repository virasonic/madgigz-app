"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n/LocaleProvider";
import { isNativeApp } from "@/lib/native";

// The mobile-web "get the app" prompt (the pattern TikTok/Instagram use): a
// visitor who opens MadGigz in a phone browser - e.g. from the download poster's
// QR or a shared /e/ link - gets a one-time sheet offering the store, with
// "continue on web" to stay put. Never shown inside our own native app
// (isNativeApp), on desktop, or in an installed PWA; dismissal is remembered
// per device. The iOS Safari Smart App Banner (layout metadata) is the other,
// native half of this.

const APP_STORE_URL = "https://apps.apple.com/app/id6800783921";
const PLAY_URL = "https://play.google.com/store/apps/details?id=es.aurasonic.madgigz";
const KEY = "madgigz_seen_app_banner";

function markSeen() {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    /* private mode / blocked - it just shows once more, no harm */
  }
}

export default function AppDownloadBanner() {
  const { t } = useT();
  const [storeUrl, setStoreUrl] = useState<string | null>(null);

  useEffect(() => {
    if (isNativeApp()) return; // never inside our own app

    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(KEY) === "1";
    } catch {
      dismissed = false;
    }
    if (dismissed) return;

    const ua = navigator.userAgent || "";
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const isAndroid = /Android/i.test(ua);
    if (!isIOS && !isAndroid) return; // phone browsers only

    // Someone who already installed the PWA has the app-like experience.
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true;
    if (standalone) return;

    /* eslint-disable react-hooks/set-state-in-effect -- client-only UA/platform detection, same shape as the other launch notices */
    setStoreUrl(isIOS ? APP_STORE_URL : PLAY_URL);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function dismiss() {
    markSeen();
    setStoreUrl(null);
  }

  if (!storeUrl) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-banner-title"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-surface p-6 pb-10 text-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny static icon, no need for next/image here */}
        <img
          src="/icons/icon-192.png"
          alt=""
          width={64}
          height={64}
          className="mx-auto rounded-2xl"
        />
        <h2 id="app-banner-title" className="mt-4 font-heading text-lg text-foreground">
          {t("appBanner.title")}
        </h2>
        <p className="mt-1 text-sm text-muted">{t("appBanner.body")}</p>

        <a href={storeUrl} onClick={markSeen} className="mt-6 block">
          <Button className="w-full">{t("appBanner.download")}</Button>
        </a>
        <button
          type="button"
          onClick={dismiss}
          className="mt-3 w-full text-center text-sm text-muted underline underline-offset-2"
        >
          {t("appBanner.continueWeb")}
        </button>
      </div>
    </div>
  );
}
