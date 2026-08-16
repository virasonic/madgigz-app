"use server";

import { revalidatePath } from "next/cache";
import { adminClient, requireAdmin } from "@/lib/supabase/admin-queries";

// Manage a show's price tiers (#151) from the admin panel. Replacing the tier
// list also recomputes the event aggregates every existing sold-out / metrics
// read still keys off: events.capacity = Σ tier caps, events.price = the lowest
// tier price ("from €x" on cards). English-only, like the rest of /admin.

export interface TierInput {
  // Present for an existing tier being edited; absent for a new one.
  id?: string;
  name: string;
  price: number;
  capacity: number;
  // ISO datetime string or null (no cutoff).
  availableUntil: string | null;
  sortOrder: number;
}

export async function setEventTiers(
  eventId: string,
  tiers: TierInput[]
): Promise<{ error: string | null }> {
  await requireAdmin();
  const admin = adminClient();

  // Validate before writing anything.
  for (const t of tiers) {
    if (!t.name.trim()) return { error: "Every tier needs a name." };
    if (!Number.isFinite(t.price) || t.price < 0) return { error: `"${t.name}" has an invalid price.` };
    if (!Number.isInteger(t.capacity) || t.capacity < 1) {
      return { error: `"${t.name}" needs a capacity of at least 1.` };
    }
  }

  const { data: existingRows, error: readError } = await admin
    .from("event_tiers")
    .select("id, sold")
    .eq("event_id", eventId);
  if (readError) {
    // 42P01 = table missing (addendum_039 not run yet).
    if (readError.code === "42P01") return { error: "Price tiers aren't available yet (run addendum_039)." };
    return { error: "Couldn't read the current tiers." };
  }

  const existing = new Map((existingRows ?? []).map((r) => [r.id as string, r.sold as number]));
  const keptIds = new Set(tiers.filter((t) => t.id).map((t) => t.id as string));

  // A tier can't shrink below what it has already sold, or the counter/cap
  // guard would be inconsistent.
  for (const t of tiers) {
    if (t.id) {
      const sold = existing.get(t.id) ?? 0;
      if (t.capacity < sold) {
        return { error: `"${t.name}" has already sold ${sold}; capacity can't be lower.` };
      }
    }
  }

  // Removed tiers: only droppable if nothing was ever sold at them (a sold tier
  // is referenced by tickets and holds the record of money that moved).
  const toDelete = [...existing.keys()].filter((id) => !keptIds.has(id));
  for (const id of toDelete) {
    if ((existing.get(id) ?? 0) > 0) {
      return { error: "Can't remove a tier that has already sold tickets." };
    }
  }
  if (toDelete.length > 0) {
    const { error } = await admin.from("event_tiers").delete().in("id", toDelete);
    if (error) return { error: "Couldn't remove a tier." };
  }

  // Upsert: update existing by id, insert new.
  for (const t of tiers) {
    const row = {
      event_id: eventId,
      name: t.name.trim(),
      price: t.price,
      capacity: t.capacity,
      available_until: t.availableUntil,
      sort_order: t.sortOrder,
    };
    if (t.id) {
      const { error } = await admin.from("event_tiers").update(row).eq("id", t.id);
      if (error) return { error: `Couldn't save "${t.name}".` };
    } else {
      const { error } = await admin.from("event_tiers").insert(row);
      if (error) return { error: `Couldn't add "${t.name}".` };
    }
  }

  // Keep the event aggregate in step so sold-out / cards / metrics stay correct.
  // Only when tiers exist — removing them all leaves the event on its own price.
  if (tiers.length > 0) {
    const totalCapacity = tiers.reduce((s, t) => s + t.capacity, 0);
    const minPrice = Math.min(...tiers.map((t) => t.price));
    await admin.from("events").update({ capacity: totalCapacity, price: minPrice }).eq("id", eventId);
  }

  revalidatePath(`/admin/events/${eventId}`);
  return { error: null };
}
