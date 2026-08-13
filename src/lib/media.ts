// Upload-size guards. Images go to Supabase Storage (kept modest, matched to the
// bucket's own limit), but VIDEO uploads to Cloudflare Stream (#138), which
// accepts big files and transcodes/shrinks them - so artists can post a large
// phone clip and let Stream do the compressing.
//
// Two Stream upload mechanisms, split by size (#140): the basic direct-upload
// POST caps at 200MB, so files up to that use it (the proven path); larger files
// use Stream's TUS resumable protocol (up to 30GB, and resumes a dropped mobile
// upload). MAX_VIDEO_FILE_BYTES is now the outer product cap, well above any
// phone clip; a Stream reel-length cap (maxDurationSeconds 600) still bounds it.
export const MAX_CONTENT_FILE_BYTES = 50 * 1024 * 1024; // images
export const STREAM_MULTIPART_MAX_BYTES = 200 * 1024 * 1024; // basic POST ceiling → TUS above this
export const MAX_VIDEO_FILE_BYTES = 5 * 1024 * 1024 * 1024; // 5GB outer cap (TUS)

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
