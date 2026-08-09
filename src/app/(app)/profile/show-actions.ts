"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ARTIST_CAPABLE_ROLES } from "@/lib/roles";

// Single-city for now; venues carry a city column so a second one is a filter
// change rather than a migration.
const MADRID = "Madrid";

export interface ShowEdits {
  description: string;
  lineup: string[];
  date: string;
  time: string;
  venueName: string;
  venueId: string | null;
  genreIds: string[];
  // Platform artists on the bill. Association only - being tagged never grants
  // any management of the show.
  taggedArtistIds: string[];
}

// Turns whatever the artist typed into a real venue id. An exact
// case-insensitive match links to the existing row - that's what stops
// "sala but" becoming a second "Sala But". Anything genuinely new is created
// unverified with no address, which is what surfaces it in the admin venues
// tab for someone to complete.
async function resolveVenue(
  admin: ReturnType<typeof createAdminClient>,
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
  const { data: cityVenues } = await admin
    .from("venues")
    .select("id, name")
    .eq("city", MADRID);

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
async function syncEventGenres(
  admin: ReturnType<typeof createAdminClient>,
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
async function syncEventArtists(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string,
  ownerId: string,
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

// Editing goes through here rather than a browser update because the RLS policy
// on events is `using (auth.uid() = artist_id)` with no column restriction - an
// artist can PATCH any column on their own show, price and capacity included.
// Leaving price out of the form would be cosmetic; this is what actually keeps
// it fixed. Only the whitelisted fields below are ever written.
export async function updateShow(
  eventId: string,
  edits: ShowEdits
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const description = edits.description.trim();
  const lineup = edits.lineup.map((act) => act.trim()).filter(Boolean);

  if (!description) return { error: "Description can't be empty" };
  if (lineup.length === 0) return { error: "Add at least one artist to the lineup" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(edits.date)) return { error: "Enter a valid date" };
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(edits.time)) return { error: "Enter a valid time" };

  const admin = createAdminClient();
  const { data: event } = await admin
    .from("events")
    .select("id, artist_id, cancelled")
    .eq("id", eventId)
    .single();

  if (!event) return { error: "Show not found" };
  if (event.artist_id !== user.id) return { error: "Not your show" };
  if (event.cancelled) return { error: "This show has been cancelled and can't be edited" };

  const venue = await resolveVenue(admin, edits.venueName, edits.venueId);
  if (venue.error) return { error: venue.error };

  const { error } = await admin
    .from("events")
    .update({
      description,
      lineup,
      venue_id: venue.id,
      // Kept as a denormalised copy so the feed and Explore can read events
      // without joining venues on every card.
      venue: venue.name,
      event_date: edits.date,
      event_time: edits.time,
      // doors tracked the start time when the show was created; keep them in
      // step rather than leaving a stale door time behind a moved set time.
      doors: edits.time,
    })
    .eq("id", eventId);

  if (error) {
    console.error("updateShow failed:", error);
    return { error: "Couldn't save those changes. Please try again." };
  }

  const tagError = await syncEventArtists(admin, eventId, user.id, edits.taggedArtistIds);
  if (tagError) return { error: tagError };

  const genreError = await syncEventGenres(admin, eventId, edits.genreIds);
  if (genreError) return { error: genreError };

  revalidatePath("/profile");
  revalidatePath("/explore");
  revalidatePath("/feed");
  return { error: null };
}

// Runs right after a show is created, to attach everything the browser isn't
// allowed to write directly: the venue link (deduped, creating an unverified
// row when it's new), the genres, and the artist tags - tags being what let
// another artist post about the show.
export async function finaliseNewShow(
  eventId: string,
  input: {
    venueName: string;
    venueId: string | null;
    genreIds: string[];
    taggedArtistIds: string[];
  }
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const admin = createAdminClient();
  const { data: event } = await admin
    .from("events")
    .select("id, artist_id")
    .eq("id", eventId)
    .single();

  if (!event) return { error: "Show not found" };
  if (event.artist_id !== user.id) return { error: "Not your show" };

  const venue = await resolveVenue(admin, input.venueName, input.venueId);
  if (venue.error) return { error: venue.error };

  if (venue.id) {
    // venue.name rather than what was typed, so casing follows the canonical
    // row when an existing venue was matched loosely.
    await admin
      .from("events")
      .update({ venue_id: venue.id, venue: venue.name })
      .eq("id", eventId);
  }

  const genreError = await syncEventGenres(admin, eventId, input.genreIds);
  if (genreError) return { error: genreError };

  const tagError = await syncEventArtists(admin, eventId, user.id, input.taggedArtistIds);
  if (tagError) return { error: tagError };

  revalidatePath("/profile");
  revalidatePath("/explore");
  return { error: null };
}
