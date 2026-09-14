"use client";

import { useT } from "@/lib/i18n/LocaleProvider";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n/config";

// The same EN/ES pill toggle used in profile Settings, as a standalone control
// so it can sit on the first screen too (#176): a user who opened the app in the
// wrong language can fix it before signing up. setLocale writes the locale cookie
// (the same one Settings uses), so the choice sticks across the whole app.
export default function LanguageToggle({ className = "" }: { className?: string }) {
  const { locale, setLocale } = useT();

  return (
    <div className={`flex gap-1 rounded-full bg-surface p-1 ${className}`}>
      {LOCALES.map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLocale(code)}
          aria-pressed={locale === code}
          className={`rounded-full px-3 py-1 text-xs font-heading ${
            locale === code ? "bg-primary text-foreground" : "text-muted"
          }`}
        >
          {LOCALE_LABELS[code]}
        </button>
      ))}
    </div>
  );
}
