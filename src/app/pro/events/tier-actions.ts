"use server";

import { revalidatePath } from "next/cache";
import { proClient, requirePro } from "@/lib/supabase/pro-queries";
import { applyEventTiers, type TierInput } from "@/lib/tiers-apply";

export type { TierInput };

// Pro-panel tier management (#151 for #88). Authorization = an active pro
// account that actually owns this show; the write itself is the shared
// applyEventTiers, the same one the admin panel and the artist's own manage-show
// sheet use - so the rules about shrinking a sold tier or removing one can't
// drift between the three surfaces.
export async function setProEventTiers(
  eventId: string,
  tiers: TierInput[]
): Promise<{ error: string | null }> {
  const { account } = await requirePro();
  const admin = proClient();

  // Re-derived from the row, never trusted from the caller: this is a public
  // POST endpoint, and a venue can see shows in its room it must not reprice.
  const { data: existing } = await admin
    .from("events")
    .select("id, pro_account_id")
    .eq("id", eventId)
    .maybeSingle();

  if (!existing || existing.pro_account_id !== account.id) {
    return { error: "That show isn't yours to edit" };
  }

  // The same payout gate the event form applies, repeated here because tiers
  // are the other way to put a price on a show: the form's own price field can
  // sit at 0 while a €20 tier does the selling, and applyEventTiers then copies
  // that up to events.price. Guarding only the form would leave the gate open.
  if (tiers.some((t) => t.price > 0)) {
    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_payouts_ready")
      .eq("id", account.id)
      .maybeSingle();
    if (!profile?.stripe_payouts_ready) {
      return {
        error:
          "Connect payouts before selling paid tickets. Free ticket types work right away.",
      };
    }
  }

  const result = await applyEventTiers(admin, eventId, tiers);
  if (!result.error) {
    revalidatePath(`/pro/events/${eventId}`);
    revalidatePath("/pro/events");
    revalidatePath(`/e/${eventId}`);
  }
  return result;
}
