"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ShowEdits {
  description: string;
  lineup: string[];
  date: string;
  time: string;
  // Platform artists on the bill. Association only - being tagged never grants
  // any management of the show.
  taggedArtistIds: string[];
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
      .eq("role", "artist")
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
// it fixed. Only the four fields below are ever written.
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

  const { error } = await admin
    .from("events")
    .update({
      description,
      lineup,
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

  revalidatePath("/profile");
  revalidatePath("/explore");
  revalidatePath("/feed");
  return { error: null };
}

// Used right after a show is created. Same ownership and validity checks as the
// edit path - the tags are what let another artist post about the show, so they
// can't be written straight from the browser.
export async function tagArtistsOnShow(
  eventId: string,
  taggedArtistIds: string[]
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

  const tagError = await syncEventArtists(admin, eventId, user.id, taggedArtistIds);
  if (tagError) return { error: tagError };

  revalidatePath("/profile");
  return { error: null };
}
