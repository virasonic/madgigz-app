"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isArtistRole } from "@/lib/roles";
import { fetchProAccount } from "@/lib/pro";
import { ContentPost, ContentPostRow, mapContentPost } from "@/lib/types";

// Set / replace / remove an artist's pinned introduction reel (#143). The media
// is uploaded client-side through the shared uploadContentMedia path (Cloudflare
// Stream for video, Supabase for images); this just records/clears the intro
// content_post. Service-role client + in-code ownership, matching the app's
// other privileged writes (saved/actions.ts, transfer-actions.ts).

interface SaveIntroInput {
  mediaUrl: string | null;
  streamUid: string | null;
  mediaType: "image" | "video";
  caption: string;
}

export type SaveIntroResult = { post: ContentPost } | { error: string };

export async function saveIntroReel(input: SaveIntroInput): Promise<SaveIntroResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const admin = createAdminClient();
  const [{ data: profile }, pro] = await Promise.all([
    admin.from("profiles").select("role, artist_name, username").eq("id", user.id).single(),
    // Promoters and venues get an intro reel too (Vir, 20 Sept 2026): a
    // promoter builds a reputation, and a page with a face and a sound on it is
    // how that starts. Read through the service-role client, like the profile
    // above - the caller is authorised here, not by RLS.
    fetchProAccount(admin, user.id),
  ]);
  const isActivePro = Boolean(pro?.active);
  if (!profile || (!isArtistRole(profile.role) && !isActivePro)) {
    return { error: "Only organisers can add an intro reel" };
  }

  if (!input.mediaUrl && !input.streamUid) return { error: "Add a photo or video" };

  // Replace: one intro per artist (enforced by the unique index), so clear the
  // old one before inserting. A new upload is a deliberate replacement.
  const { error: delError } = await admin
    .from("content_posts")
    .delete()
    .eq("artist_id", user.id)
    .eq("is_intro", true);
  if (delError && delError.code !== "42P01") {
    console.error("saveIntroReel clear failed:", delError);
    return { error: "Couldn't update your intro reel. Please try again." };
  }

  const { data: inserted, error: insertError } = await admin
    .from("content_posts")
    .insert({
      event_id: null,
      artist_id: user.id,
      artist_name: pro?.displayName ?? profile.artist_name ?? profile.username,
      show_title: "",
      caption: input.caption.trim(),
      media_url: input.mediaUrl,
      media_type: input.mediaType,
      is_intro: true,
      ...(input.streamUid ? { stream_uid: input.streamUid } : {}),
    })
    .select("*, profiles(artist_photo_url)")
    .single();
  if (insertError || !inserted) {
    // Missing column = addendum_038 not run yet.
    if (insertError?.code === "42703") {
      return { error: "Intro reels aren't available yet. Try again shortly." };
    }
    console.error("saveIntroReel insert failed:", insertError);
    return { error: "Couldn't save your intro reel. Please try again." };
  }

  revalidatePath("/profile");
  // The public page is keyed by username now, not the id, so invalidate the
  // whole dynamic route rather than one id path.
  revalidatePath("/profile/[artistId]", "page");
  return { post: mapContentPost(inserted as ContentPostRow) };
}

export async function removeIntroReel(): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("content_posts")
    .delete()
    .eq("artist_id", user.id)
    .eq("is_intro", true);
  if (error && error.code !== "42P01") {
    console.error("removeIntroReel failed:", error);
    return { error: "Couldn't remove your intro reel. Please try again." };
  }

  revalidatePath("/profile");
  // The public page is keyed by username now, not the id, so invalidate the
  // whole dynamic route rather than one id path.
  revalidatePath("/profile/[artistId]", "page");
  return { error: null };
}
