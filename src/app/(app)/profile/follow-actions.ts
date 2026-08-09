"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Follows are written with the caller's own client, not the admin one: the RLS
// policies (auth.uid() = follower_id) are the enforcement, and routing this
// through the service role would quietly remove the only thing stopping one
// person following on another's behalf.
export async function toggleFollow(
  artistId: string,
  currentlyFollowing: boolean
): Promise<{ following: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { following: currentlyFollowing, error: "You need to be signed in" };
  if (user.id === artistId) {
    return { following: false, error: "You can't follow yourself" };
  }

  if (currentlyFollowing) {
    // .select() so a refusal is detectable: a delete blocked by RLS matches
    // zero rows and returns no error, which would otherwise look like success
    // and leave the button showing the wrong state.
    const { data, error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", user.id)
      .eq("artist_id", artistId)
      .select("artist_id");

    if (error || (data?.length ?? 0) === 0) {
      if (error) console.error("unfollow failed:", error);
      return { following: true, error: "Couldn't unfollow - try again" };
    }
  } else {
    const { error } = await supabase
      .from("follows")
      .insert({ follower_id: user.id, artist_id: artistId });

    // 23505 = already following. The end state is what was wanted either way.
    if (error && error.code !== "23505") {
      console.error("follow failed:", error);
      return { following: false, error: "Couldn't follow - try again" };
    }
  }

  revalidatePath(`/profile/${artistId}`);
  revalidatePath("/explore");
  return { following: !currentlyFollowing };
}
