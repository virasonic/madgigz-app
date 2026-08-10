import { en } from "./en";
import { es } from "./es";

// Two languages, toggled by the person - not routed in the URL. MadGigz is a
// mobile app with no per-locale SEO need, so a cookie beats restructuring every
// route under a /[locale] segment (which is what the Next App Router i18n guide
// assumes). Adding a third language later is a new catalog file and one line
// here, no routing change.
export const LOCALES = ["en", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es"; // Madrid first; English is the alternate.

export const LOCALE_COOKIE = "madgigz_locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  es: "Español",
};

// The English catalog is the source of truth for the shape. The Spanish one is
// typed against it, so a missing or misspelled key is a compile error, not a
// blank string a fan sees at runtime.
export type Messages = typeof en;

const DICTIONARIES: Record<Locale, Messages> = { en, es };

export function isLocale(value: string | undefined): value is Locale {
  return value === "en" || value === "es";
}

export function getMessages(locale: Locale): Messages {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

// Resolves a dot path ("landing.fanTitle") against a catalog, with optional
// {name} interpolation. Returns the key itself if it's missing, which surfaces
// the gap loudly in dev rather than rendering nothing.
export function translate(
  messages: Messages,
  key: string,
  vars?: Record<string, string | number>
): string {
  const value = key.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, messages);

  if (typeof value !== "string") {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`Missing translation: ${key}`);
    }
    return key;
  }

  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (_, name) =>
    name in vars ? String(vars[name]) : `{${name}}`
  );
}
