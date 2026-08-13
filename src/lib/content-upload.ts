import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadEventMedia } from "@/lib/supabase/storage";
import { createStreamDirectUpload, createStreamTusUpload } from "@/app/(app)/feed/stream-actions";
import { STREAM_MULTIPART_MAX_BYTES } from "@/lib/media";

export interface ContentUpload {
  /** Supabase Storage URL for images (and for video only when Stream is off). */
  mediaUrl: string | null;
  /** Cloudflare Stream id for video (#138); null otherwise. */
  streamUid: string | null;
}

/** 0→1 upload progress, only emitted for large (TUS) video uploads (#140). */
export type UploadProgress = (fraction: number) => void;

// Cloudflare requires TUS PATCH chunks be a multiple of 256 KiB and (bar the
// final one) at least 5 MiB. 50 MiB satisfies both and keeps the request count
// sane for multi-GB files.
const TUS_CHUNK_BYTES = 50 * 1024 * 1024;

// Sends a large video to Cloudflare Stream over TUS. The upload is created
// server-side (createStreamTusUpload mints the one-time Location); tus-js-client
// resumes into it, so the secret token never reaches the browser. Dynamically
// imported so tus-js-client only loads when a big file is actually posted.
async function uploadVideoViaTus(
  uploadURL: string,
  file: File,
  onProgress?: UploadProgress
): Promise<void> {
  const tus = await import("tus-js-client");
  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      uploadUrl: uploadURL,
      chunkSize: TUS_CHUNK_BYTES,
      // Cloudflare's endpoint reports offsets that let a dropped upload resume;
      // the defaults (localStorage fingerprint) handle that.
      onError: (err) => reject(err),
      onProgress: (sent, total) => {
        if (onProgress && total > 0) onProgress(sent / total);
      },
      onSuccess: () => resolve(),
    });
    upload.start();
  });
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
  folder: string,
  onProgress?: UploadProgress
): Promise<ContentUpload> {
  if (mediaType === "video") {
    // Big files (> the 200MB basic-POST ceiling) go over TUS so they aren't
    // blocked and can resume; smaller ones keep the proven direct_upload POST.
    // Both are Cloudflare Stream — one branch by size, not two call sites (the
    // #138 drift was two separate modals, which is now the single shared path).
    if (file.size > STREAM_MULTIPART_MAX_BYTES) {
      const tus = await createStreamTusUpload(file.size);
      if (tus === null) {
        return { mediaUrl: await uploadEventMedia(supabase, file, folder), streamUid: null };
      }
      if ("error" in tus) throw new Error(tus.error);
      await uploadVideoViaTus(tus.uploadURL, file, onProgress);
      return { mediaUrl: null, streamUid: tus.uid };
    }

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
