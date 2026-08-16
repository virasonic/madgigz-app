import type { SupabaseClient } from "@supabase/supabase-js";

// Shared price-tier write logic (#151), used by BOTH the admin panel and the
// artist's own manage-show sheet. The two callers differ only in how they prove
// the caller may touch this event (admin vs owner); once that's established they
// apply tiers identically — replacing the list also recomputes the aggregates
// every existing sold-out / metrics read keys off: events.capacity = Σ tier caps,
// events.price = the lowest tier price. Takes a service-role client, so it must
// only be called after the caller's own authorization check.

export interface TierInput {
  // Present for an existing tier being edited; absent for a new one.
  id?: string;
  name: string;
  price: number;
  capacity: number;
  // ISO datetime string or null (no cutoff).
  availableUntil: string | null;
  sortOrder: number;
  // Max of this type one order may buy; defaults to 6 when omitted.
  maxPerOrder?: number;
}

export async function applyEventTiers(
  admin: SupabaseClient,
  eventId: string,
  tiers: TierInput[]
): Promise<{ error: string | null }> {
  for (const t of tiers) {
    if (!t.name.trim()) return { error: "Every ticket type needs a name." };
    if (!Number.isFinite(t.price) || t.price < 0) return { error: `"${t.name}" has an invalid price.` };
    if (!Number.isInteger(t.capacity) || t.capacity < 1) {
      return { error: `"${t.name}" needs an availability of at least 1.` };
    }
    const mpo = t.maxPerOrder ?? 6;
    if (!Number.isInteger(mpo) || mpo < 1) {
      return { error: `"${t.name}" needs a max-per-order of at least 1.` };
    }
  }

  // The room total (events.capacity) is the artist's own number and stays put —
  // the ticket types allocate within it. Guard against types summing to more
  // seats than the room holds.
  const { data: eventRow } = await admin
    .from("events")
    .select("capacity")
    .eq("id", eventId)
    .single();
  const roomCapacity = eventRow?.capacity ?? null;
  if (roomCapacity !== null && tiers.length > 0) {
    const totalAvailable = tiers.reduce((s, t) => s + t.capacity, 0);
    if (totalAvailable > roomCapacity) {
      return {
        error: `Ticket types add up to ${totalAvailable}, more than the ${roomCapacity} capacity.`,
      };
    }
  }

  const { data: existingRows, error: readError } = await admin
    .from("event_tiers")
    .select("id, sold")
    .eq("event_id", eventId);
  if (readError) {
    if (readError.code === "42P01") return { error: "Price tiers aren't available yet (run addendum_039)." };
    return { error: "Couldn't read the current tiers." };
  }

  const existing = new Map((existingRows ?? []).map((r) => [r.id as string, r.sold as number]));
  const keptIds = new Set(tiers.filter((t) => t.id).map((t) => t.id as string));

  // A tier can't shrink below what it has already sold.
  for (const t of tiers) {
    if (t.id) {
      const sold = existing.get(t.id) ?? 0;
      if (t.capacity < sold) {
        return { error: `"${t.name}" has already sold ${sold}; capacity can't be lower.` };
      }
    }
  }

  // Removed tiers are droppable only if nothing was ever sold at them (a sold
  // tier is referenced by tickets and holds the record of money that moved).
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

  for (const t of tiers) {
    const row = {
      event_id: eventId,
      name: t.name.trim(),
      price: t.price,
      capacity: t.capacity,
      available_until: t.availableUntil,
      sort_order: t.sortOrder,
      max_per_order: t.maxPerOrder ?? 6,
    };
    if (t.id) {
      const { error } = await admin.from("event_tiers").update(row).eq("id", t.id);
      if (error) return { error: `Couldn't save "${t.name}".` };
    } else {
      const { error } = await admin.from("event_tiers").insert(row);
      if (error) return { error: `Couldn't add "${t.name}".` };
    }
  }

  // events.price is the "from" price on cards, derived from the cheapest type.
  // events.capacity is the artist's room total and is left untouched (validated
  // above). Only meaningful when types exist.
  if (tiers.length > 0) {
    const minPrice = Math.min(...tiers.map((t) => t.price));
    await admin.from("events").update({ price: minPrice }).eq("id", eventId);
  }

  return { error: null };
}
