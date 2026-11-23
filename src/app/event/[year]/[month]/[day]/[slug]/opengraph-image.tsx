import { createClient } from "@/lib/supabase/server";
import { fetchEventBySlug } from "@/lib/supabase/queries";
import { parseEventPath } from "@/lib/event-url";
import { OG_CARD_ALT, OG_CARD_SIZE, eventCard } from "@/lib/og-event-card";

// Per-event social preview card (#172) for the pretty URL (#236). The card
// itself is drawn in @/lib/og-event-card; this file resolves the show from the
// path and declares the route-segment config Next parses statically.
export const runtime = "nodejs";
export const alt = OG_CARD_ALT;
export const size = OG_CARD_SIZE;
export const contentType = "image/png";

export default async function Image({
  params,
}: {
  params: Promise<{ year: string; month: string; day: string; slug: string }>;
}) {
  const { year, month, day, slug } = await params;
  const parsed = parseEventPath([year, month, day, slug]);

  let event = null;
  try {
    const supabase = await createClient();
    event = parsed ? await fetchEventBySlug(supabase, parsed.slug) : null;
  } catch {
    event = null;
  }
  return eventCard(event);
}
