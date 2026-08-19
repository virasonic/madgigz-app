"use server";

import { revalidatePath } from "next/cache";
import { adminClient, requireAdmin } from "@/lib/supabase/admin-queries";

// Tag an approved artist onto an existing gig (#153). This is the admin
// approving a suggested match: it writes the event_artists row that puts the
// show on the artist's profile and lets them post content to it.
export async function tagArtistToEvent(
  eventId: string,
  profileId: string
): Promise<{ error?: string }> {
  await requireAdmin();
  const admin = adminClient();

  // Re-check the artist is approved — the suggestion was computed earlier and the
  // caller is a public POST endpoint, so don't trust the pair blindly.
  const { data: profile } = await admin
    .from("profiles")
    .select("artist_status")
    .eq("id", profileId)
    .maybeSingle();
  if (!profile || profile.artist_status !== "approved") {
    return { error: "That artist isn't approved." };
  }

  const { error } = await admin
    .from("event_artists")
    .upsert({ event_id: eventId, profile_id: profileId }, { onConflict: "event_id,profile_id", ignoreDuplicates: true });
  if (error) {
    console.error("tagArtistToEvent failed:", error);
    return { error: "Couldn't tag the artist. Please try again." };
  }

  revalidatePath("/admin/matches");
  revalidatePath(`/e/${eventId}`);
  return {};
}
