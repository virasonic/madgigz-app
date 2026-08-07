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
