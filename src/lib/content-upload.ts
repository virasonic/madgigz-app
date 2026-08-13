import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadEventMedia } from "@/lib/supabase/storage";
import { createStreamDirectUpload } from "@/app/(app)/feed/stream-actions";

export interface ContentUpload {
  /** Supabase Storage URL for images (and for video only when Stream is off). */
  mediaUrl: string | null;
  /** Cloudflare Stream id for video (#138); null otherwise. */
  streamUid: string | null;
}

/**
 * The single content-media upload path, shared by the feed's "+" (AddContentModal)
 * and the manage-show sheet (ManageShowModal). It exists because those two paths
 * DID drift once: Stream was wired into one and not the other, so reels posted
 * from the show sheet silently went to Supabase and never reached Cloudflare (#138).
 *
 * Video → Cloudflare Stream when it's configured (transcode + HLS + CDN + a real
 * thumbnail), falling back to Supabase only when Stream isn't set up at all.
 * Images always go to Supabase. Throws on a genuine Stream upload failure so the
 * caller surfaces it rather than silently dropping to Supabase — silent fallback
 * is exactly what hid the bug.
 */
export async function uploadContentMedia(
  supabase: SupabaseClient,
  file: File,
  mediaType: "image" | "video",
  folder: string
): Promise<ContentUpload> {
  if (mediaType === "video") {
    const upload = await createStreamDirectUpload();
    // null = Stream not configured (no token) → Supabase keeps posting working.
    if (upload === null) {
      return { mediaUrl: await uploadEventMedia(supabase, file, folder), streamUid: null };
    }
    if ("error" in upload) throw new Error(upload.error);

    const form = new FormData();
    form.append("file", file);
    const res = await fetch(upload.uploadURL, { method: "POST", body: form });
    if (!res.ok) throw new Error(`Stream upload failed (${res.status})`);
    return { mediaUrl: null, streamUid: upload.uid };
  }

  return { mediaUrl: await uploadEventMedia(supabase, file, folder), streamUid: null };
}
