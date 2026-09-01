"use server";

import { revalidatePath } from "next/cache";
import { adminClient, requireAdmin } from "@/lib/supabase/admin-queries";
import { logDecision } from "@/lib/decision-ledger";

// Pull a post (or put it back). Soft: hidden_at is set rather than the row
// deleted, so a mistake is reversible and the report trail survives. Runs
// through the service-role client, which is the only thing that can touch
// another artist's post - the RLS policies don't let anyone else.
export async function setPostHidden(
  postId: string,
  hidden: boolean
): Promise<{ error: string | null }> {
  const currentAdmin = await requireAdmin();
  const admin = adminClient();

  const { error } = await admin
    .from("content_posts")
    .update({ hidden_at: hidden ? new Date().toISOString() : null })
    .eq("id", postId);

  if (error) {
    console.error("setPostHidden failed:", error);
    return { error: "Couldn't update that post." };
  }

  revalidatePath("/admin/moderation");
  revalidatePath("/feed");
  await logDecision(admin, currentAdmin.id, {
    action: hidden ? "post_hidden" : "post_unhidden",
    subjectType: "post",
    subjectId: postId,
  });
  return { error: null };
}

type ReportStatus = "open" | "actioned" | "dismissed";
const STATUSES: ReportStatus[] = ["open", "actioned", "dismissed"];

// Close a report. "actioned" means we hid the post; "dismissed" means we looked
// and it's fine. Both leave the queue; "open" reopens it.
export async function setReportStatus(
  reportId: string,
  status: string
): Promise<{ error: string | null }> {
  const currentAdmin = await requireAdmin();
  if (!(STATUSES as string[]).includes(status)) return { error: "Unknown status" };

  const resolved = status !== "open";
  const admin = adminClient();
  const { error } = await admin
    .from("content_reports")
    .update({
      status,
      resolved_at: resolved ? new Date().toISOString() : null,
      resolved_by: resolved ? currentAdmin.id : null,
    })
    .eq("id", reportId);

  if (error) {
    console.error("setReportStatus failed:", error);
    return { error: "Couldn't update that report." };
  }

  revalidatePath("/admin/moderation");
  revalidatePath("/admin");
  await logDecision(admin, currentAdmin.id, {
    action:
      status === "actioned"
        ? "report_actioned"
        : status === "dismissed"
          ? "report_dismissed"
          : "report_reopened",
    subjectType: "report",
    subjectId: reportId,
  });
  return { error: null };
}
