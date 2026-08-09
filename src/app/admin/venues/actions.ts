"use server";

import { revalidatePath } from "next/cache";
import { adminClient, requireAdmin } from "@/lib/supabase/admin-queries";

export interface VenueInput {
  name: string;
  address: string;
  postalCode: string;
  capacity: string;
  city: string;
}

function clean(input: VenueInput) {
  const capacity = input.capacity.trim() ? Number(input.capacity) : null;
  return {
    name: input.name.trim(),
    address: input.address.trim() || null,
    postal_code: input.postalCode.trim() || null,
    city: input.city.trim() || "Madrid",
    capacity: capacity !== null && Number.isFinite(capacity) && capacity > 0 ? capacity : null,
  };
}

export async function createVenue(input: VenueInput): Promise<{ error: string | null }> {
  await requireAdmin();
  const fields = clean(input);
  if (!fields.name) return { error: "Name is required" };

  // Anything an admin adds by hand is verified by definition - they're the one
  // checking it. The unverified ones are what artists typed in.
  const { error } = await adminClient()
    .from("venues")
    .insert({ ...fields, verified: true });

  if (error) {
    console.error("createVenue failed:", error);
    // 23505 = the unique index on (lower(name), lower(city)).
    return { error: error.code === "23505" ? "That venue already exists" : "Couldn't save venue" };
  }

  revalidatePath("/admin/venues");
  return { error: null };
}

export async function updateVenue(
  venueId: string,
  input: VenueInput
): Promise<{ error: string | null }> {
  await requireAdmin();
  const fields = clean(input);
  if (!fields.name) return { error: "Name is required" };

  // Editing a venue is the act of checking it, so it stops being unverified.
  const { error } = await adminClient()
    .from("venues")
    .update({ ...fields, verified: true })
    .eq("id", venueId);

  if (error) {
    console.error("updateVenue failed:", error);
    return { error: error.code === "23505" ? "That venue already exists" : "Couldn't save venue" };
  }

  revalidatePath("/admin/venues");
  return { error: null };
}

// Deactivated rather than deleted: events reference venues, and a room closing
// down shouldn't rewrite the history of shows that happened there.
export async function setVenueActive(venueId: string, active: boolean) {
  await requireAdmin();
  await adminClient().from("venues").update({ active }).eq("id", venueId);
  revalidatePath("/admin/venues");
}
