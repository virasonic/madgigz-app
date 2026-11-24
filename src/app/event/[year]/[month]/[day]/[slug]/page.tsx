import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchEventBySlug } from "@/lib/supabase/queries";
import { eventPath, parseEventPath } from "@/lib/event-url";
import type { EventItem } from "@/lib/types";
import { EventPageView, eventMetadata } from "./EventPageView";

// The one page in the app that a logged-out stranger is meant to see. Everything
// else redirects to "/" without a session; this is what a shared link opens, so
// it has to stand on its own - outside the (app) group, no bottom nav, no auth.
//
// The gate is on buying, not looking. Walling off the event itself would defeat
// the point of sharing: the person receiving the link has no account and no
// reason to make one until they can see what the gig actually is.
//
// The URL is /event/yyyy/mm/dd/<slug> (#236) - four explicit segments rather
// than a catch-all because Next refuses opengraph-image under a catch-all. The
// slug is what identifies the
// show; the date is there for the human reading the link. So the lookup is by
// slug alone, and a date that doesn't match the show's current date - it was
// rescheduled after the link went out - 308s to the right one rather than 404s.
// The old /e/<id> shape 308s here too (src/app/e/[eventId]/page.tsx).

type Params = PageProps<"/event/[year]/[month]/[day]/[slug]">["params"];
type SearchParams = PageProps<"/event/[year]/[month]/[day]/[slug]">["searchParams"];

/**
 * Resolve the show behind the path. Returns null for a malformed path or an
 * unknown slug; redirects (never returns) when the date in the URL is stale.
 * The query string survives the redirect: ?buy=1 opens the ticket sheet, and a
 * shared link with it on is the whole point of #102.
 */
async function resolveEvent(
  supabase: SupabaseClient,
  params: Params,
  searchParams?: SearchParams
): Promise<EventItem | null> {
  const { year, month, day, slug } = await params;
  const parts = [year, month, day, slug];
  const parsed = parseEventPath(parts);
  if (!parsed) return null;
  const event = await fetchEventBySlug(supabase, parsed.slug);
  if (!event) return null;
  const canonical = eventPath(event);
  if (canonical !== `/event/${parts.join("/")}`) {
    const query = searchParams ? queryString(await searchParams) : "";
    permanentRedirect(`${canonical}${query}`);
  }
  return event;
}

function queryString(sp: Record<string, string | string[] | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach((x) => q.append(k, x));
    else if (v !== undefined) q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function generateMetadata({
  params,
}: PageProps<"/event/[year]/[month]/[day]/[slug]">): Promise<Metadata> {
  const supabase = await createClient();
  // No searchParams here on purpose: a stale-date redirect from metadata would
  // drop the query, and the page body (which has it) redirects first anyway.
  const event = await resolveEvent(supabase, params);

  return eventMetadata(event, supabase);
}

export default async function PublicEventPage({
  params,
  searchParams,
}: PageProps<"/event/[year]/[month]/[day]/[slug]">) {
  const supabase = await createClient();

  const event = await resolveEvent(supabase, params, searchParams);
  // A hidden show is hidden from everyone, link or no link. Cancelled shows
  // stay reachable on purpose - someone holding a ticket and a link deserves
  // to be told it's off, not shown a 404.
  if (!event || !event.active) notFound();

  return <EventPageView event={event} supabase={supabase} />;
}

