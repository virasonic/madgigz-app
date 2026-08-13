// Upload-size guards. Images go to Supabase Storage (kept modest, matched to the
// bucket's own limit), but VIDEO now uploads to Cloudflare Stream (#138), which
// accepts big files and transcodes/shrinks them - so artists can post a large
// phone clip and let Stream do the compressing. 200MB is the ceiling of Stream's
// basic direct-upload POST (larger would need the TUS protocol).
export const MAX_CONTENT_FILE_BYTES = 50 * 1024 * 1024; // images
export const MAX_VIDEO_FILE_BYTES = 200 * 1024 * 1024; // video → Cloudflare Stream

/** The size cap for a given media type. Shared by AddContentModal and
 *  ManageShowModal so their file checks can't drift (they did once - #138). */
export function maxBytesForMediaType(mediaType: "image" | "video"): number {
  return mediaType === "video" ? MAX_VIDEO_FILE_BYTES : MAX_CONTENT_FILE_BYTES;
}

export function mediaTypeForFile(file: File): "image" | "video" | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return null;
}
