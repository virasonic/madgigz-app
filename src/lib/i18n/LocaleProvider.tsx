"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { getMessages, Locale, LOCALE_COOKIE, translate } from "./config";

interface LocaleContextValue {
  locale: Locale;
  t: (key: string, vars?: Record<string, string | number>) => string;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

// Wraps the app once, in the root layout. It's handed the locale the server
// already resolved, so the first paint is in the right language - no flash of
// the wrong one. Both catalogs are small plain objects, so importing them
// client-side here is cheaper than serialising one across the RSC boundary
// every render.
export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const router = useRouter();
  const messages = getMessages(locale);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(messages, key, vars),
    [messages]
  );

  const setLocale = useCallback(
    (next: Locale) => {
      // A year, path=/, lax: it's a preference, not a secret. router.refresh()
      // re-runs the Server Components with the new cookie so server-rendered
      // strings switch too, not just the client ones.
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    },
    [router]
  );

  const value = useMemo(() => ({ locale, t, setLocale }), [locale, t, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useT(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useT must be used within a LocaleProvider");
  return ctx;
}
