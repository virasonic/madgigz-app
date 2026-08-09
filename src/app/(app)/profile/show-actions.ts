"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ShowEdits {
  description: string;
  lineup: string[];
  date: string;
  time: string;
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

  revalidatePath("/profile");
  revalidatePath("/explore");
  revalidatePath("/feed");
  return { error: null };
}
