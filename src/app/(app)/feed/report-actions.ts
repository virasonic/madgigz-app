"use server";

import { createClient } from "@/lib/supabase/server";

export type ReportReason = "spam" | "inappropriate" | "hate" | "violence" | "other";
const REASONS: ReportReason[] = ["spam", "inappropriate", "hate", "violence", "other"];

// Files a report against a feed post. The reporter is taken from the session,
// never passed in, and the unique index (addendum_031) makes a second report on
// the same post by the same person a no-op rather than an error.
export async function reportContent(input: {
  contentPostId: string;
  reason: string;
  detail?: string;
}): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to report" };

  const reason = (REASONS as string[]).includes(input.reason)
    ? (input.reason as ReportReason)
    : "other";

  const { error } = await supabase.from("content_reports").insert({
    content_post_id: input.contentPostId,
    reporter_id: user.id,
    reason,
    detail: input.detail?.trim()?.slice(0, 1000) || null,
  });

  // 23505 = the unique index: they've already reported this one. Treat as
  // success - the outcome they wanted (it's flagged) is already true.
  if (error && error.code !== "23505") {
    console.error("reportContent failed:", error);
    return { error: "Couldn't send that report. Please try again." };
  }

  return { error: null };
}
