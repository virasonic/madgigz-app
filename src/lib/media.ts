// Content media now lives in real Supabase Storage, not localStorage, so this
// is just a sane upload-size guard rather than a workaround for a quota.
export const MAX_CONTENT_FILE_BYTES = 8 * 1024 * 1024;

export function mediaTypeForFile(file: File): "image" | "video" | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return null;
}
