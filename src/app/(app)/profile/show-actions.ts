"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveVenue, syncEventArtists, syncEventGenres } from "@/lib/show-sync";
import { applyEventTiers, type TierInput } from "@/lib/tiers-apply";

export type { TierInput };

// An artist manages the price tiers (#151) on their OWN show. Same shared write
// as the admin panel; the only difference is the authorization check — the
// event must belong to the caller. Not tagged acts: being on a bill never grants
// management (mirrors updateShow).
export async function saveArtistTiers(
  eventId: string,
  tiers: TierInput[]
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

  const result = await applyEventTiers(admin, eventId, tiers);
  if (!result.error) revalidatePath("/profile");
  return result;
}

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


// Lets an artist take themselves off a bill they were added to. Deletes only
// their own event_artists row, so the show itself is untouched - it just stops
// appearing on their profile, public and private, and they lose the right to
// post about it.
//
// Needed because tagging is done by someone else: a cancelled show, or one they
// were never really on, would otherwise sit on their profile forever with no
// way to shift it. The event_artists policies are written around the show's
// owner, so this runs through the admin client with the caller re-derived from
// the session rather than trusted from the argument.
export async function removeSelfFromShow(eventId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("event_artists")
    .delete()
    .eq("event_id", eventId)
    .eq("profile_id", user.id)
    .select("event_id");

  if (error) {
    console.error("removeSelfFromShow failed:", error);
    return { error: "Couldn't remove the show" };
  }
  if ((data?.length ?? 0) === 0) return { error: "You're not tagged on that show" };

  revalidatePath("/profile");
  revalidatePath(`/profile/${user.id}`);
  return { error: null };
}
