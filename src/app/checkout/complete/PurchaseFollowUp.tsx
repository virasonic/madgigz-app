import { createClient } from "@/lib/supabase/server";
import { fetchEventById } from "@/lib/supabase/queries";
import PostPurchaseActions from "@/components/friends/PostPurchaseActions";

// Server half of the paid success screen's social follow-up (#149 Phase B):
// resolves the show the tickets are for, then hands to the shared client block.
// Renders nothing if the event can't be found, so the receipt page never breaks
// over a nicety.
export default async function PurchaseFollowUp({
  eventId,
  quantity,
}: {
  eventId: string | null;
  quantity: number;
}) {
  if (!eventId) return null;
  const supabase = await createClient();
  const event = await fetchEventById(supabase, eventId);
  if (!event) return null;
  return (
    <div className="w-full max-w-sm">
      <PostPurchaseActions event={event} quantity={quantity} />
    </div>
  );
}
