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
  // Optional Spanish variants (addendum_043). Left blank = English-only, and
  // every reader sees the base headline/body.
  headlineEs?: string;
  bodyEs?: string;
}): Promise<{ error: string | null }> {
  const admin = await requireAdmin();

  const headline = input.headline.trim();
  const body = input.body.trim();
  const headlineEs = (input.headlineEs ?? "").trim();
  const bodyEs = (input.bodyEs ?? "").trim();
  if (!headline) return { error: "Write a headline" };
  if (headline.length > 120) return { error: "Headline is a bit long - keep it punchy" };
  if (body.length > 500) return { error: "Body is over 500 characters" };
  if (headlineEs.length > 120) return { error: "Spanish headline is a bit long - keep it punchy" };
  if (bodyEs.length > 500) return { error: "Spanish body is over 500 characters" };

  const accent = /^#[0-9a-fA-F]{6}$/.test(input.accent) ? input.accent : "#d76616";

  const { error } = await insertAnnouncement({
    event_id: null,
    artist_id: admin.id,
    artist_name: "MadGigz",
    show_title: "",
    headline,
    caption: body,
    accent_color: accent,
    media_url: null,
    media_type: "text",
    headline_es: headlineEs || null,
    caption_es: bodyEs || null,
  });

  if (error) {
    console.error("text announcement insert failed:", error);
    return { error: "Couldn't post that. Please try again." };
  }

  revalidatePath("/admin/announcements");
  revalidatePath("/feed");
  return { error: null };
}

// Inserts an announcement row, degrading gracefully in the window before
// addendum_043 has been run: if the Spanish columns don't exist yet the insert
// fails with 42703 (undefined column), so we drop them and retry with the base
// fields. Once the migration is in, the first attempt succeeds. Same
// ship-code-before-SQL pattern the rest of the app uses.
async function insertAnnouncement(
  row: Record<string, unknown> & { headline_es: string | null; caption_es: string | null }
): Promise<{ error: { code?: string } | null }> {
  const db = adminClient();
  const { error } = await db.from("content_posts").insert(row);
  if (error?.code === "42703") {
    const base: Record<string, unknown> = { ...row };
    delete base.headline_es;
    delete base.caption_es;
    return db.from("content_posts").insert(base);
  }
  return { error };
}

// The upload path, for when a designed image or a video is the point rather
// than text on the template.
export async function createAnnouncement(form: FormData): Promise<{ error: string | null }> {
  const admin = await requireAdmin();

  const caption = String(form.get("caption") ?? "").trim();
  const captionEs = String(form.get("caption_es") ?? "").trim();
  const file = form.get("media");

  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image or video" };
  if (!caption) return { error: "Write a caption" };
  if (captionEs.length > 500) return { error: "Spanish caption is over 500 characters" };
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

  const { error } = await insertAnnouncement({
    event_id: null,
    artist_id: admin.id,
    artist_name: "MadGigz",
    show_title: "",
    caption,
    media_url: publicUrl,
    media_type: isVideo ? "video" : "image",
    headline_es: null,
    caption_es: captionEs || null,
  });

  if (error) {
    console.error("announcement insert failed:", error);
    return { error: "Couldn't post that. Please try again." };
  }

  revalidatePath("/admin/announcements");
  revalidatePath("/feed");
  return { error: null };
}

// Add or change the Spanish variants on an announcement that already exists -
// the "editable later" the create path promised. Lets an admin translate the
// English-only announcements posted before addendum_043 without re-posting them
// (which would lose their place in the feed). Scoped to event_id null so it
// can't touch an artist's post, exactly like deleteAnnouncement.
export async function updateAnnouncementLocale(input: {
  id: string;
  headlineEs: string;
  captionEs: string;
}): Promise<{ error: string | null }> {
  await requireAdmin();

  const headlineEs = input.headlineEs.trim();
  const captionEs = input.captionEs.trim();
  if (headlineEs.length > 120) return { error: "Spanish headline is a bit long - keep it punchy" };
  if (captionEs.length > 500) return { error: "Spanish caption is over 500 characters" };

  const { error } = await adminClient()
    .from("content_posts")
    .update({ headline_es: headlineEs || null, caption_es: captionEs || null })
    .eq("id", input.id)
    .is("event_id", null);

  if (error) {
    // Ship-before-SQL: if addendum_043 hasn't been run on this project yet the
    // columns don't exist (42703). Say so plainly rather than a generic failure.
    if (error.code === "42703") {
      return { error: "The Spanish columns aren't in this database yet — run addendum_043, then try again." };
    }
    console.error("announcement locale update failed:", error);
    return { error: "Couldn't save the Spanish. Please try again." };
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
