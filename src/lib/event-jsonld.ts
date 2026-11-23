import type { EventItem } from "@/lib/types";

// schema.org structured data for the public event page (#238), so Google can
// show the show as an event - date, venue, price - rather than a plain blue
// link, and so the madgigz.app page is the one it picks for the gig's name.
//
// Shape follows Google's "Event" rich-result guide: name, startDate and a
// location with a postal address are required; image, description, offers,
// performer, organizer and eventStatus are the recommended extras, all filled
// from what the page already renders. Pure and dependency-free so it can be
// unit-tested against fixed inputs.

export type JsonLdPerformer = { name: string; url?: string };
export type JsonLdOrganiser = { name: string; url?: string };

export type EventJsonLdInput = {
  event: EventItem;
  /** The canonical absolute URL of the page. */
  url: string;
  performers: JsonLdPerformer[];
  organiser: JsonLdOrganiser | null;
  /** Whether the show is sold out right now (capacity - sold <= 0). */
  soldOut: boolean;
};

// Shows are in Madrid: an ISO-8601 instant with the local offset is what Google
// asks for, and a bare "2026-12-18T21:00" would be read as UTC by some
// consumers - an hour or two off on the listing. Node's Intl knows the DST
// rules, so the offset is derived rather than hardcoded.
export function madridIso(date: string, time: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  const t = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!d || !t) return null;
  const hh = t[1].padStart(2, "0");
  const mm = t[2];
  // Take the wall-clock instant as if it were UTC, ask Intl what Madrid's
  // offset is around then, and stamp it on. The offset at the UTC-guess and at
  // the true instant can only differ across a DST switch at 02:00/03:00, which
  // no gig starts at.
  const guess = new Date(`${d[1]}-${d[2]}-${d[3]}T${hh}:${mm}:00Z`);
  if (Number.isNaN(guess.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    timeZoneName: "longOffset",
  }).formatToParts(guess);
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const offset = name === "GMT" ? "+00:00" : name.replace("GMT", "");
  return `${d[1]}-${d[2]}-${d[3]}T${hh}:${mm}:00${offset}`;
}

export function eventJsonLd({ event, url, performers, organiser, soldOut }: EventJsonLdInput) {
  const startDate = madridIso(event.date, event.time) ?? event.date;
  const doorTime = madridIso(event.date, event.doors);
  const externalUrl = event.ticketing?.mode === "external" ? event.ticketing.url : undefined;

  const availability = event.cancelled
    ? "https://schema.org/Discontinued"
    : soldOut
      ? "https://schema.org/SoldOut"
      : "https://schema.org/InStock";

  return {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    name: event.title,
    url,
    startDate,
    ...(doorTime ? { doorTime } : {}),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: event.cancelled
      ? "https://schema.org/EventCancelled"
      : "https://schema.org/EventScheduled",
    location: {
      "@type": "Place",
      name: event.venue,
      address: {
        "@type": "PostalAddress",
        ...(event.venueAddress ? { streetAddress: event.venueAddress } : {}),
        addressLocality: event.city,
        addressCountry: "ES",
      },
    },
    ...(event.image ? { image: [event.image] } : {}),
    ...(event.description ? { description: event.description } : {}),
    isAccessibleForFree: event.price === 0,
    offers: {
      "@type": "Offer",
      url: externalUrl ?? url,
      price: event.price.toFixed(2),
      priceCurrency: "EUR",
      availability,
    },
    ...(performers.length > 0
      ? {
          performer: performers.map((p) => ({
            "@type": "MusicGroup",
            name: p.name,
            ...(p.url ? { url: p.url } : {}),
          })),
        }
      : {}),
    ...(organiser
      ? {
          organizer: {
            "@type": "Organization",
            name: organiser.name,
            ...(organiser.url ? { url: organiser.url } : {}),
          },
        }
      : {}),
  };
}

// JSON.stringify does not escape "<", so a title containing "</script>" would
// end the tag early (the Next JSON-LD guide's own caveat). Unicode-escaping it
// is enough: the result is still valid JSON for the crawler.
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
