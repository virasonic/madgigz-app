"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/LocaleProvider";

interface BackButtonProps {
  /** Where to go. Omit to step back in history (the usual case). */
  href?: string;
  className?: string;
}

// A small round brand-orange back chip. Screens are reached from more than one
// place (a reel, a card, the profile grid), so it steps back in history by
// default rather than linking somewhere that might not be where you came from.
// Icon-only to stay tiny; the label lives in aria-label for screen readers.
export default function BackButton({ href, className = "" }: BackButtonProps) {
  const router = useRouter();
  const { t } = useT();

  return (
    <button
      type="button"
      aria-label={t("common.back")}
      onClick={() => (href ? router.push(href) : router.back())}
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
