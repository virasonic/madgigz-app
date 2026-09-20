"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isLocale } from "@/lib/i18n/config";
import { requirePro } from "@/lib/supabase/pro-queries";

/**
 * The one thing a pro account may change about itself. addendum_054 grants
 * UPDATE on exactly this column and adds a policy scoped to your own active
 * row, so this write is hemmed in by the database too, not only by the check
 * here - which is why it can safely go through the CALLER's client rather than
 * the service-role one.
 */
export async function setProPanelLocale(locale: string): Promise<{ error: string | null }> {
  await requirePro();
  if (!isLocale(locale)) return { error: "Unsupported language" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  // Read the row back: an UPDATE the policy or the grant refuses matches zero
  // rows and returns no error, which would report a locked door as a success.
  const { data, error } = await supabase
    .from("pro_accounts")
    .update({ locale })
    .eq("id", user.id)
    .select("locale");

  if (error || !data || data.length === 0) {
    // 42703 / PGRST204 = addendum_054 hasn't been run here yet.
    console.error("setProPanelLocale failed:", error);
    return { error: "Couldn't change the language. Please try again." };
  }

  revalidatePath("/pro", "layout");
  return { error: null };
}
