import type { SupabaseClient } from "@supabase/supabase-js";

export async function uploadEventMedia(
  supabase: SupabaseClient,
  file: File,
  folder: string
): Promise<string> {
  const path = `${folder}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  const { error } = await supabase.storage.from("event-media").upload(path, file);
  if (error) throw error;

  const {
    data: { publicUrl },
  } = supabase.storage.from("event-media").getPublicUrl(path);
  return publicUrl;
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
