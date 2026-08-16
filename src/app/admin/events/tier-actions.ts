"use server";

import { revalidatePath } from "next/cache";
import { adminClient, requireAdmin } from "@/lib/supabase/admin-queries";
import { applyEventTiers, type TierInput } from "@/lib/tiers-apply";

export type { TierInput };

// Admin-panel tier management (#151). Authorization = admin; the actual write
// (validate, upsert, recompute event aggregates) is the shared applyEventTiers,
// which the artist's own manage-show sheet uses too. English, like all of /admin.
export async function setEventTiers(
  eventId: string,
  tiers: TierInput[]
): Promise<{ error: string | null }> {
  await requireAdmin();
  const result = await applyEventTiers(adminClient(), eventId, tiers);
  if (!result.error) revalidatePath(`/admin/events/${eventId}`);
  return result;
}
