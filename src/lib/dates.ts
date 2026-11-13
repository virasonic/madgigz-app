import type { Locale } from "@/lib/i18n/config";

// The app's language mapped to a BCP-47 locale for date formatting. Spanish
// gets es-ES ("viernes 15 agosto"); English stays en-GB to keep the
// day-then-month order English readers expect. Pass the result straight to
// toLocaleDateString. Always pair it with timeZone: "UTC" when formatting an
// event date string, so a negative-offset browser doesn't shift the day back.
export function dateLocale(locale: Locale): string {
  return locale === "es" ? "es-ES" : "en-GB";
}

// Today's calendar date (YYYY-MM-DD) where the shows are. Event dates are plain
// Madrid dates, so "is this in the past?" has to be asked in Madrid time, not
// in the server's UTC - which is still yesterday for the first hours of the day.
export function todayInMadrid(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(now);
}

// A show's date may be corrected, but not MOVED into the past. The payout hold
// is "7 days after the show" (src/lib/payouts.ts), so backdating a show with
// sales would make its takings look releasable for a night that hasn't
// happened. Re-saving an already-past show with its date untouched stays fine.
export function movesDateIntoPast(currentDate: string, nextDate: string, now?: Date): boolean {
  return nextDate !== currentDate && nextDate < todayInMadrid(now);
}

