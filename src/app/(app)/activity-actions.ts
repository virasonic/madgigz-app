"use server";

import type { AppPlatform } from "@/lib/native";
import { createClient } from "@/lib/supabase/server";

// Stamp the caller's user_activity row (#228 follow-up): platform + now.
// Owner-scoped by construction - touch_user_activity() upserts auth.uid()'s row
// and takes nothing that could name another user. Never throws: activity
// reporting must not surface as an error in the app, and before addendum_066
// is run on a database the function simply isn't there (42883 / PGRST202).
export async function touchUserActivity(platform: AppPlatform): Promise<{ ok: boolean }> {
  if (platform !== "ios" && platform !== "android" && platform !== "web") return { ok: false };
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false };
    const { error } = await supabase.rpc("touch_user_activity", { p_platform: platform });
    return { ok: !error };
  } catch {
    return { ok: false };
  }
}
