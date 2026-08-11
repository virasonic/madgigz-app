"use client";

import { useT } from "@/lib/i18n/LocaleProvider";
import { CURRENT_CITY } from "@/lib/city";

// The local-first cue (#90): a small pin + the current city, so the fan knows at
// a glance the app is showing *their* city. The full "You're in Madrid" phrasing
// is the accessible label; the pill itself stays compact. One city for now.
export default function CityBadge({ className = "" }: { className?: string }) {
  const { t } = useT();
  return (
    <span
      aria-label={t("city.youAreIn", { city: CURRENT_CITY })}
      className={`inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-xs font-heading text-muted ${className}`}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="text-accent"
      >
        <path
          d="M12 21s-6-5.686-6-10a6 6 0 1 1 12 0c0 4.314-6 10-6 10Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="11" r="2" fill="currentColor" />
      </svg>
      {CURRENT_CITY}
    </span>
  );
}
