import type { EventItem } from "@/lib/types";
import type { Locale } from "@/lib/i18n/config";
import { dateLocale } from "@/lib/dates";

// The search snippet for a public event page (#239): the `<title>` Google shows
// as the blue link and the description under it. Before this the title was the
// bare show name and the description a "Buy tickets" line, so a search for the
// act + "Madrid" had nothing to match on. Now the words people type come first:
// the act, the venue, the city, the date - then the price.
//
// Only the document title and meta description change. The OpenGraph title and
// description stay the short share-preview line, because what sells a gig in a
// WhatsApp thread is the poster and one line, not a search snippet.
//
// Pure: everything comes in as arguments so it can be unit-tested against
// fixed inputs in both languages.

export type EventSeoInput = {
  event: EventItem;
  /** Genre names for the show, most relevant first. Empty when none tagged. */
  genres: readonly string[];
  locale: Locale;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

/** "{artist} en {venue}, Madrid · vie, 30 oct · Entradas" */
export function eventSeoTitle({ event, locale, t }: EventSeoInput): string {
  return t("seo.eventTitle", {
    artist: event.artist,
    venue: event.venue,
    city: event.city,
    date: shortDate(event.date, locale),
  });
}

/**
 * "{acts} en directo en {venue} (Madrid), el viernes 30 de octubre a las 21:00.
 *  Indie rock. Entradas desde 8 € en MadGigz."
 * No verb that has to agree with the act: "Celia Becks tocan" is wrong and
 * "tocan" vs "toca" can't be known from a name.
 */
export function eventSeoDescription({ event, genres, locale, t }: EventSeoInput): string {
  const parts = [
    t("seo.eventWhere", {
      acts: actsLine(event),
      venue: event.venue,
      city: event.city,
      date: longDate(event.date, locale),
      time: clockTime(event.time),
    }),
  ];
  if (genres.length > 0) parts.push(`${genres.slice(0, 2).join(", ")}.`);
  parts.push(priceLine(event, locale, t));
  return parts.join(" ");
}

// The line-up when there is one ("DOI + Losing The Count"), else the headline
// act. Capped so a festival bill doesn't become the whole description.
function actsLine(event: EventItem): string {
  const acts = event.lineup.filter((a) => a.trim().length > 0);
  if (acts.length === 0) return event.artist;
  const shown = acts.slice(0, 3);
  return acts.length > 3 ? `${shown.join(" + ")} + …` : shown.join(" + ");
}

function priceLine(event: EventItem, locale: Locale, t: EventSeoInput["t"]): string {
  if (event.price <= 0) return t("seo.eventFree");
  const price = formatPrice(event.price, locale);
  // An externally-ticketed show is listed here but sold elsewhere, so the
  // snippet mustn't promise tickets "on MadGigz".
  return event.ticketing?.mode === "external"
    ? t("seo.eventPrice", { price })
    : t("seo.eventPriceOn", { price });
}

// "8 €" / "12,50 €" in Spanish, "€8" / "€12.50" in English - the currency
// convention of the language, not of the server. Whole euros stay bare; a
// price with cents always shows both digits ("12,5 €" reads as a typo).
export function formatPrice(euros: number, locale: Locale): string {
  const digits = Number.isInteger(euros) ? 0 : 2;
  const n = euros.toLocaleString(dateLocale(locale), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return locale === "es" ? `${n} €` : `€${n}`;
}

// "vie, 30 oct" / "Fri 30 Oct". UTC, like every other event-date format in
// the app: event_date is a plain calendar date and must not shift with the
// server's zone.
function shortDate(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleDateString(dateLocale(locale), {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

// "viernes, 30 de octubre" / "Friday 30 October".
function longDate(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleDateString(dateLocale(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

// events.event_time is a Postgres `time`, which arrives as "21:00:00"; the
// seconds are noise in a sentence.
export function clockTime(time: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : time;
}
