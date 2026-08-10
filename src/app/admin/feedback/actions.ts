"use server";

import { revalidatePath } from "next/cache";
import { adminClient, requireAdmin } from "@/lib/supabase/admin-queries";

type Status = "new" | "open" | "resolved";
const STATUSES: Status[] = ["new", "open", "resolved"];

// Triage runs through the service-role client on purpose: addendum_027 grants
// no UPDATE on feedback to anyone, so status and notes can only be changed from
// here, behind requireAdmin().
export async function setFeedbackStatus(
  id: string,
  status: string
): Promise<{ error: string | null }> {
  // requireAdmin returns the signed-in admin, which is who gets recorded
  // against a resolution.
  const currentAdmin = await requireAdmin();

  if (!(STATUSES as string[]).includes(status)) return { error: "Unknown status" };

  const { error } = await adminClient()
    .from("feedback")
    .update({
      status,
      // Both cleared when reopening, so a reopened item doesn't keep claiming
      // it was dealt with, on a date in the past, by someone who didn't.
      resolved_at: status === "resolved" ? new Date().toISOString() : null,
      resolved_by: status === "resolved" ? currentAdmin.id : null,
    })
    .eq("id", id);

  if (error) {
    console.error("setFeedbackStatus failed:", error);
    return { error: "Couldn't update that. Please try again." };
  }

  revalidatePath("/admin/feedback");
  revalidatePath("/admin");
  return { error: null };
}

export async function saveFeedbackNote(
  id: string,
  note: string
): Promise<{ error: string | null }> {
  await requireAdmin();

  const { error } = await adminClient()
    .from("feedback")
    .update({ admin_note: note.trim() || null })
    .eq("id", id);

  if (error) {
    console.error("saveFeedbackNote failed:", error);
    return { error: "Couldn't save that note." };
  }

  revalidatePath("/admin/feedback");
  return { error: null };
}
