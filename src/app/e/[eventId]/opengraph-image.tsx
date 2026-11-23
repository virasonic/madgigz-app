import { createClient } from "@/lib/supabase/server";
import { fetchEventById } from "@/lib/supabase/queries";
import { OG_CARD_ALT, OG_CARD_SIZE, eventCard } from "@/lib/og-event-card";

// The legacy /e/<id> link keeps its preview card (#172): messaging apps fetch
// the URL that was pasted, and until addendum_073 has run that URL is the one
// the page itself serves (#236).
export const runtime = "nodejs";
export const alt = OG_CARD_ALT;
export const size = OG_CARD_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  let event = null;
  try {
    const supabase = await createClient();
    event = await fetchEventById(supabase, eventId);
  } catch {
    event = null;
  }
  return eventCard(event);
}
