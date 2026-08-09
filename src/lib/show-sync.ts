// The bits of saving a show that the browser is never allowed to write
// directly: the venue link, the genres, and the artist tags. Extracted from
// profile/show-actions.ts when the admin panel gained its own create form -
// two copies of venue deduplication is exactly how "Sala But" and "sala but"
// end up as separate rows.
//
// Server-only: every function takes the service-role client.
import type { SupabaseClient } from "@supabase/supabase-js";
import { ARTIST_CAPABLE_ROLES } from "@/lib/roles";

// Single-city for now; venues carry a city column so a second one is a filter
// change rather than a migration.
export const MADRID = "Madrid";

// Turns whatever was typed into a real venue id. An exact case-insensitive
// match links to the existing row - that's what stops "sala but" becoming a
// second "Sala But". Anything genuinely new is created unverified with no
// address, which is what surfaces it in the admin venues tab for someone to
// complete.
export async function resolveVenue(
  admin: SupabaseClient,
  name: string,
  venueId: string | null
): Promise<{ id: string | null; name: string; error: string | null }> {
  const trimmed = name.trim();
  if (!trimmed) return { id: null, name: "", error: "Venue is required" };

  if (venueId) {
    const { data } = await admin.from("venues").select("id, name").eq("id", venueId).single();
    if (data) return { id: data.id, name: data.name, error: null };
    // Fall through and match on the name if the id was stale.
  }

  // Compared in JS rather than with ilike: "_" and "%" are LIKE wildcards, so a
  // venue called "Sala 100%" or "Sala_B" would match the wrong row. Same trap as
  // the discount-code and username lookups. The table is one city's venues, so
  // reading it whole is cheap.
  const { data: cityVenues } = await admin.from("venues").select("id, name").eq("city", MADRID);

  const existing = (cityVenues ?? []).find(
    (v) => (v.name as string).toLowerCase() === trimmed.toLowerCase()
  );

  if (existing) return { id: existing.id as string, name: existing.name as string, error: null };

  const { data: created, error } = await admin
    .from("venues")
    .insert({ name: trimmed, city: MADRID, verified: false })
    .select("id, name")
    .single();

  if (error || !created) {
    console.error("resolveVenue insert failed:", error);
    return { id: null, name: trimmed, error: "Couldn't save that venue" };
  }

  return { id: created.id, name: created.name, error: null };
}

// Replaces an event's genres with exactly this set.
export async function syncEventGenres(
  admin: SupabaseClient,
  eventId: string,
  genreIds: string[]
): Promise<string | null> {
  const wanted = [...new Set(genreIds)];

  const { error: clearError } = await admin
    .from("event_genres")
    .delete()
    .eq("event_id", eventId);
  if (clearError) {
    if (clearError.code === "42P01") {
      console.error("event_genres missing - run addendum_014; skipping genre sync");
      return null;
    }
    console.error("syncEventGenres clear failed:", clearError);
    return "Couldn't update the genres";
  }

  if (wanted.length === 0) return null;

  const { error } = await admin
    .from("event_genres")
    .insert(wanted.map((genreId) => ({ event_id: eventId, genre_id: genreId })));
  if (error) {
    console.error("syncEventGenres insert failed:", error);
    return "Couldn't update the genres";
  }
  return null;
}

// Replaces an event's tags with exactly this set. Ids are checked against
// approved artists here rather than trusted from the form, and the owner is
// dropped - they're on the bill by definition and a self-tag would double them
// up on their own profile.
//
// ownerId is null for an admin-created show with no platform artist behind it,
// in which case there is nobody to exclude.
export async function syncEventArtists(
  admin: SupabaseClient,
  eventId: string,
  ownerId: string | null,
  requestedIds: string[]
): Promise<string | null> {
  const wanted = [...new Set(requestedIds)].filter((id) => id !== ownerId);

  if (wanted.length > 0) {
    const { data: valid } = await admin
      .from("profiles")
      .select("id")
      .in("id", wanted)
      .in("role", ARTIST_CAPABLE_ROLES)
      .eq("artist_status", "approved");

    const validIds = new Set((valid ?? []).map((p) => p.id as string));
    if (validIds.size !== wanted.length) return "Some tagged artists couldn't be found";
  }

  const { error: clearError } = await admin
    .from("event_artists")
    .delete()
    .eq("event_id", eventId);
  if (clearError) {
    // 42P01 = table missing, i.e. addendum_012 hasn't been run yet. During that
    // window the rest of the edit still saved correctly, so don't report a
    // failure the artist can't act on - tagging simply does nothing until the
    // migration lands. Any other error is a real one.
    if (clearError.code === "42P01") {
      console.error("event_artists missing - run addendum_012; skipping tag sync");
      return null;
    }
    console.error("syncEventArtists clear failed:", clearError);
    return "Couldn't update the lineup tags";
  }

  if (wanted.length === 0) return null;

  const { error: insertError } = await admin
    .from("event_artists")
    .insert(wanted.map((profileId) => ({ event_id: eventId, profile_id: profileId })));
  if (insertError) {
    console.error("syncEventArtists insert failed:", insertError);
    return "Couldn't update the lineup tags";
  }

  return null;
}
