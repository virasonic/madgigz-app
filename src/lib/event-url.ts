// The shape of a shared event link (#236):
//
//   /event/2026/11/28/weyvir-sala-x
//
// Year, month and day come from the show's date at render time; only the slug
// is stored (events.slug, addendum_073, assigned once at insert). One place
// builds the path and one place parses it, so the share sheet, OG tags, sitemap,
// canonical and the page's own date-mismatch redirect can never disagree.
//
// Pure and client-safe: no next/headers, no Supabase. Server-only helpers that
// need these (revalidation) live beside their callers.

/** The minimum an event needs to carry to have a URL. */
export type EventLinkTarget = { id: string; slug: string | null; date: string };

/** The legacy /e/<id> path. Still served - it 301s to the pretty URL. */
export function legacyEventPath(eventId: string): string {
  return `/e/${eventId}`;
}

/**
 * Where a shared event link points. Falls back to /e/<id> for a row with no
 * slug yet (a database where addendum_073 hasn't run), so nothing breaks in
 * the gap between deploying the code and running the SQL.
 */
export function eventPath(event: EventLinkTarget): string {
  const date = splitIsoDate(event.date);
  if (!event.slug || !date) return legacyEventPath(event.id);
  return `/event/${date.year}/${date.month}/${date.day}/${event.slug}`;
}

export type ParsedEventPath = { date: string; slug: string };

/**
 * The catch-all segments after /event/, in order. Accepts exactly four parts
 * (yyyy, mm, dd, slug) with the date numerically plausible; anything else is
 * null and the route 404s. The date is normalised to yyyy-mm-dd so it can be
 * compared with events.event_date as-is - "2026/9/5" and "2026/09/05" both
 * parse, and both get redirected onto the canonical two-digit form because the
 * path they rebuild differs from the one requested.
 */
export function parseEventPath(parts: readonly string[]): ParsedEventPath | null {
  if (parts.length !== 4) return null;
  const [y, m, d, slug] = parts;
  if (!/^\d{4}$/.test(y) || !/^\d{1,2}$/.test(m) || !/^\d{1,2}$/.test(d)) return null;
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // Slugs are what addendum_073's slugify() emits plus a possible "-2" suffix:
  // lower-case ASCII letters, digits and single hyphens. Anything else is not
  // one of ours. Length-capped so a crafted path can't be used as a 4KB lookup.
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return null;
  return { date: `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, slug };
}

function splitIsoDate(iso: string): { year: string; month: string; day: string } | null {
  // events.event_date is a Postgres `date`, which PostgREST returns as a bare
  // yyyy-mm-dd string. Take only that prefix so a timestamp sneaking in (a
  // client-side Date.toISOString, say) still yields the calendar day.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return { year: m[1], month: m[2], day: m[3] };
}
