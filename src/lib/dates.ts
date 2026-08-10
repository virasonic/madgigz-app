import type { Locale } from "@/lib/i18n/config";

// The app's language mapped to a BCP-47 locale for date formatting. Spanish
// gets es-ES ("viernes 15 agosto"); English stays en-GB to keep the
// day-then-month order English readers expect. Pass the result straight to
// toLocaleDateString. Always pair it with timeZone: "UTC" when formatting an
// event date string, so a negative-offset browser doesn't shift the day back.
export function dateLocale(locale: Locale): string {
  return locale === "es" ? "es-ES" : "en-GB";
}
