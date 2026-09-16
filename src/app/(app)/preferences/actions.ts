"use server";

import { createClient } from "@/lib/supabase/server";
import type { FanPreferences } from "@/lib/fan-preferences";

// Upsert the signed-in fan's discovery preferences (#170). Owner-scoped: it only
// ever writes the caller's own row (RLS enforces it too). Returns an error string
// rather than throwing so the screen can show a friendly message - including the
// pre-migration case where fan_preferences doesn't exist yet (42P01).
export async function saveFanPreferences(prefs: FanPreferences): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { error } = await supabase.from("fan_preferences").upsert({
    user_id: user.id,
    genre_ids: prefs.genreIds,
    weekdays: prefs.weekdays,
    time_buckets: prefs.timeBuckets,
    capacity_buckets: prefs.capacityBuckets,
    updated_at: new Date().toISOString(),
  });

  return { ok: !error };
}
