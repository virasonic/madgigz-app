"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// The caller's own client, not the admin one: the RLS policy
// (auth.uid() = recipient_id) is what stops someone marking another person's
// notifications read, and the service role would bypass exactly that.
export async function markNotificationsRead(ids: string[]): Promise<{ error?: string }> {
  if (ids.length === 0) return {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .in("id", ids)
    .eq("recipient_id", user.id)
    .is("read_at", null);

  if (error) {
    console.error("markNotificationsRead failed:", error);
    return { error: "Couldn't mark those as read" };
  }

  // The unread dot lives in the shell, so the layout has to re-render too.
  revalidatePath("/notifications");
  revalidatePath("/profile");
  return {};
}
