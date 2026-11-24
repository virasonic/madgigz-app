import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { siteOrigin } from "@/lib/site";
import { eventPath } from "@/lib/event-url";

// What Google is actually told to crawl. Deliberately narrow: almost every
// route in this app is behind a session, so the sitemap lists only what a
// logged-out stranger can genuinely read - the landing page, Explore, the
// legal pages, and every upcoming show at /event/yyyy/mm/dd/<slug> (#236).
//
// Kept in step with robots.ts: anything disallowed there must not appear here,
// because a URL that is both submitted and blocked is the one combination
// Search Console reports as an error.
//
// Regenerated hourly rather than per-request. A new show appearing in the
// sitemap within the hour is far faster than Google's recrawl interval, and it
// keeps a crawler hit from turning into a database query every time.
export const revalidate = 3600;

type EventSitemapRow = { id: string; slug: string | null; event_date: string; created_at: string };

// A plain anon client, not the cookie-bound one from @/lib/supabase/server:
// reading cookies() would force this route dynamic and defeat `revalidate`.
// There is no session to respect here anyway - the sitemap is the same for
// everyone, and "Events are viewable by everyone" is a real select policy.
async function upcomingEvents(): Promise<EventSitemapRow[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return [];

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const query = (columns: string) =>
    supabase
      .from("events")
      .select(columns)
      // The same three conditions the public event page enforces before it
      // renders: hidden, cancelled and finished shows are all soft-404s in
      // spirit, and submitting them trains Google to distrust the sitemap.
      .eq("active", true)
      .eq("cancelled", false)
      // Date-only compare in UTC, matching fetchEvents' upcomingOnly - >= keeps a
      // show listed through its own day.
      .gte("event_date", new Date().toISOString().slice(0, 10))
      .order("event_date")
      // The format's hard ceiling is 50,000 URLs; this cap is three orders of
      // magnitude below it and exists only so a runaway import can't produce an
      // oversized document. If it is ever hit, the answer is a sitemap index.
      .limit(5000);

  let { data, error } = await query("id, slug, event_date, created_at");
  // A database where addendum_073 hasn't run has no slug column (42703). Fall
  // back to the legacy shape rather than drop every show from the sitemap.
  if (error?.code === "42703") {
    ({ data, error } = await query("id, event_date, created_at"));
  }

  // Best-effort: a sitemap that lists the static pages beats a 500 that tells
  // Google the whole file is broken.
  if (error) {
    console.error("sitemap: could not load events", error.message);
    return [];
  }
  return ((data ?? []) as unknown as Partial<EventSitemapRow>[]).map((row) => ({
    id: row.id as string,
    slug: row.slug ?? null,
    event_date: row.event_date as string,
    created_at: row.created_at as string,
  }));
}

type ProfileSitemapRow = { username: string };

// Public artist/venue profiles (#196 opened them to guests). A profile is a
// landing page for an act or venue name, so these are worth indexing. "Public"
// = an approved artist OR an active pro account (pro_type set), matching the
// visibility test the /profile page itself enforces. username, artist_status and
// pro_type are all anon-granted (Explore reads them for guests).
async function publicProfiles(): Promise<ProfileSitemapRow[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return [];

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase
    .from("profiles")
    .select("username")
    .or("artist_status.eq.approved,pro_type.not.is.null")
    .limit(5000);

  // Best-effort, like upcomingEvents: a missing pro_type column (pre-addendum
  // _053) or any other error just drops the profile section rather than 500ing
  // the whole sitemap.
  if (error) {
    console.error("sitemap: could not load profiles", error.message);
    return [];
  }
  return (data ?? []) as ProfileSitemapRow[];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    // No trailing slash: Next resolves the landing page's own canonical tag to
    // the bare origin, and a sitemap must never disagree with the canonical it
    // points at.
    { url: origin, lastModified: now, changeFrequency: "daily", priority: 1 },
    // Guest-readable (see the (app) layout) and the natural "what's on in
    // Madrid" hub - it links out to every event page, so it is also how a
    // crawler finds shows between sitemap regenerations.
    { url: `${origin}/explore`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    // The plain-text "conciertos hoy en Madrid" page (#239): the one written
    // for the "what's on tonight" search and for AI answer engines to quote.
    {
      url: `${origin}/conciertos-hoy`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    // The supply-side ads landing page. High priority because it is one of only
    // two pages here written to be found by someone who doesn't know MadGigz.
    {
      url: `${origin}/for-artists`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    { url: `${origin}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${origin}/complaints`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${origin}/report-content`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    {
      url: `${origin}/delete-account`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  const [events, profiles] = await Promise.all([upcomingEvents(), publicProfiles()]);

  return [
    ...staticRoutes,
    ...events.map((event) => ({
      url: `${origin}${eventPath({ id: event.id, slug: event.slug, date: event.event_date })}`,
      // events has no updated_at column, so created_at is the most honest
      // lastmod available. Overstating freshness (e.g. always "now") is worse
      // than a conservative date: Google learns to ignore the field entirely.
      lastModified: new Date(event.created_at),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...profiles.map((p) => ({
      url: `${origin}/profile/${encodeURIComponent(p.username)}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
