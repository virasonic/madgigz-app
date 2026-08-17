"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/LocaleProvider";

interface BackButtonProps {
  /** Where to go. Omit to step back in history (the usual case). */
  href?: string;
  /** Where to land when there's no history to step back to (a cold-opened
   *  shared link). Defaults to the feed. Ignored when `href` is set. */
  fallbackHref?: string;
  className?: string;
}

// A small round brand-orange back chip. Screens are reached from more than one
// place (a reel, a card, the profile grid), so it steps back in history by
// default rather than linking somewhere that might not be where you came from.
// Icon-only to stay tiny; the label lives in aria-label for screen readers.
export default function BackButton({ href, fallbackHref = "/feed", className = "" }: BackButtonProps) {
  const router = useRouter();
  const { t } = useT();

  function handleClick() {
    if (href) return router.push(href);
    // A back chip with nowhere to go back to (opened from a cold shared link,
    // history length 1) would be a dead button — send them into the app instead.
    if (typeof window !== "undefined" && window.history.length > 1) return router.back();
    router.push(fallbackHref);
  }

  return (
    <button
      type="button"
      aria-label={t("common.back")}
      onClick={handleClick}
      className={`flex h-9 w-9 items-center justify-center rounded-full bg-surface text-foreground shadow-sm transition-transform duration-150 hover:bg-surface-raised active:scale-90 ${className}`}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M15 5 8 12l7 7"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
