import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchEventById } from "@/lib/supabase/queries";
import { eventPath, legacyEventPath } from "@/lib/event-url";
import { EventPageView, eventMetadata } from "../../event/[year]/[month]/[day]/[slug]/EventPageView";

// The old share-link shape, /e/<uuid>. Links in this form are on posters, in
// WhatsApp threads and in Google's index, so it is served forever - as a 301 to
// the pretty URL (#236). The query string rides along: ?buy=1 opens the ticket
// sheet on arrival, and a QR on a poster may well carry it.
//
// Until addendum_073 has run the show has no slug and eventPath() returns this
// very path. A redirect to itself would loop, so in that state the page is
// rendered here instead, canonical and all - nothing a fan can tell apart.
export async function generateMetadata({
  params,
}: PageProps<"/e/[eventId]">): Promise<Metadata> {
  const { eventId } = await params;
  const supabase = await createClient();
  return eventMetadata(await fetchEventById(supabase, eventId));
}

export default async function LegacyEventPage({
  params,
  searchParams,
}: PageProps<"/e/[eventId]">) {
  const { eventId } = await params;
  const supabase = await createClient();
  const event = await fetchEventById(supabase, eventId);
  if (!event || !event.active) notFound();

  const target = eventPath(event);
  if (target === legacyEventPath(event.id)) {
    return <EventPageView event={event} supabase={supabase} />;
  }

  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach((x) => q.append(k, x));
    else if (v !== undefined) q.set(k, v);
  }
  const query = q.toString();
  permanentRedirect(query ? `${target}?${query}` : target);
}
