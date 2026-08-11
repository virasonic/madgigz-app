import type { SupabaseClient } from "@supabase/supabase-js";
import { downscaleImage } from "@/lib/image-resize";

export async function uploadEventMedia(
  supabase: SupabaseClient,
  file: File,
  folder: string
): Promise<string> {
  // #96: shrink images before upload (posters, avatars, content photos all come
  // through here). Videos and undecodable formats pass through unchanged.
  const upload = await downscaleImage(file);
  const path = `${folder}/${Date.now()}-${upload.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  const { error } = await supabase.storage.from("event-media").upload(path, upload);
  if (error) throw error;

  const {
    data: { publicUrl },
  } = supabase.storage.from("event-media").getPublicUrl(path);
  return publicUrl;
}

export const ARTIST_EVIDENCE_BUCKET = "artist-evidence";

// Deliberately not uploadEventMedia: that writes to a public bucket, which is
// right for posters and reels and wrong for anything an artist sends to prove
// who they are. Returns the storage path, not a URL - there is no public URL to
// return, and admins read it through a signed link instead.
export async function uploadArtistEvidence(
  supabase: SupabaseClient,
  file: File,
  userId: string
): Promise<string> {
  // The user id has to be the first path segment: the bucket's insert policy
  // checks it, so an artist can't write into someone else's folder.
  const path = `${userId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  const { error } = await supabase.storage.from(ARTIST_EVIDENCE_BUCKET).upload(path, file);
  if (error) throw error;
  return path;
}

const PUBLIC_URL_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/event-media/`;

// Picsum seed-data URLs return null here and are left alone - only our own
// uploaded Storage objects should ever be removed.
function eventMediaPath(url: string): string | null {
  return url.startsWith(PUBLIC_URL_PREFIX) ? url.slice(PUBLIC_URL_PREFIX.length) : null;
}

export async function removeEventMedia(supabase: SupabaseClient, urls: (string | null | undefined)[]) {
  const paths = urls.filter((url): url is string => Boolean(url)).map(eventMediaPath).filter((p): p is string => Boolean(p));
  if (paths.length === 0) return;
  await supabase.storage.from("event-media").remove(paths);
}
