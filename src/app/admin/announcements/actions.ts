"use server";

import { revalidatePath } from "next/cache";
import { adminClient, requireAdmin } from "@/lib/supabase/admin-queries";

// The default path: an admin types a headline and body, and it renders on the
// brand template (a CSS card, see AnnouncementCard) - no image generation, no
// upload, editable later.
export async function createTextAnnouncement(input: {
  headline: string;
  body: string;
  accent: string;
}): Promise<{ error: string | null }> {
  const admin = await requireAdmin();

  const headline = input.headline.trim();
  const body = input.body.trim();
  if (!headline) return { error: "Write a headline" };
  if (headline.length > 120) return { error: "Headline is a bit long - keep it punchy" };
  if (body.length > 500) return { error: "Body is over 500 characters" };

  const accent = /^#[0-9a-fA-F]{6}$/.test(input.accent) ? input.accent : "#d76616";

  const { error } = await adminClient().from("content_posts").insert({
    event_id: null,
    artist_id: admin.id,
    artist_name: "MadGigz",
    show_title: "",
    headline,
    caption: body,
    accent_color: accent,
    media_url: null,
    media_type: "text",
  });

  if (error) {
    console.error("text announcement insert failed:", error);
    return { error: "Couldn't post that. Please try again." };
  }

  revalidatePath("/admin/announcements");
  revalidatePath("/feed");
  return { error: null };
}

// The upload path, for when a designed image or a video is the point rather
// than text on the template.
export async function createAnnouncement(form: FormData): Promise<{ error: string | null }> {
  const admin = await requireAdmin();

  const caption = String(form.get("caption") ?? "").trim();
  const file = form.get("media");

  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image or video" };
  if (!caption) return { error: "Write a caption" };
  // The same ceiling the artist content upload uses.
  if (file.size > 50 * 1024 * 1024) return { error: "That file is over 50MB" };

  const isVideo = file.type.startsWith("video/");
  if (!isVideo && !file.type.startsWith("image/")) {
    return { error: "Only images and video, please" };
  }

  const db = adminClient();
  const extension = file.name.split(".").pop()?.toLowerCase() ?? (isVideo ? "mp4" : "jpg");
  // Timestamped rather than named after the caption: uploading a replacement to
  // the same path keeps the URL, and browsers then serve the old file forever.
  const path = `announcements/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;

  const { error: upErr } = await db.storage
    .from("event-media")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) {
    console.error("announcement upload failed:", upErr);
    return { error: "Couldn't upload that file. Please try again." };
  }

  const {
    data: { publicUrl },
  } = db.storage.from("event-media").getPublicUrl(path);

  const { error } = await db.from("content_posts").insert({
    event_id: null,
    artist_id: admin.id,
    artist_name: "MadGigz",
    show_title: "",
    caption,
    media_url: publicUrl,
    media_type: isVideo ? "video" : "image",
  });

  if (error) {
    console.error("announcement insert failed:", error);
    return { error: "Couldn't post that. Please try again." };
  }

  revalidatePath("/admin/announcements");
  revalidatePath("/feed");
  return { error: null };
}

export async function deleteAnnouncement(id: string): Promise<{ error: string | null }> {
  await requireAdmin();

  // Scoped to announcements explicitly. Without the null check this action
  // would happily delete an artist's post given its id.
  const { error } = await adminClient()
    .from("content_posts")
    .delete()
    .eq("id", id)
    .is("event_id", null);

  if (error) {
    console.error("announcement delete failed:", error);
    return { error: "Couldn't remove that." };
  }

  revalidatePath("/admin/announcements");
  revalidatePath("/feed");
  return { error: null };
}
