import type { SupabaseClient } from "@supabase/supabase-js";

// The decision ledger (#164). Records operational decisions to a service-role-
// only audit table (addendum_047) so we accumulate a record of admin judgment —
// a plain audit trail today, the training corpus for the future ops-agent (#163)
// tomorrow.
//
// Design rule: logging is BEST-EFFORT and must never fail the real action. Every
// call is fire-and-forget-ish — it swallows errors and, in particular, no-ops
// when the table isn't there yet (42P01), because this code ships before the
// addendum is run by hand.

export interface DecisionInput {
  /** e.g. "artist_approved", "ticket_refunded", "report_dismissed". */
  action: string;
  /** "artist" | "event" | "ticket" | "post" | "report". */
  subjectType?: string | null;
  subjectId?: string | null;
  /** Free-text rationale — optional for a human, filled by the agent later. */
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

// `admin` must be a service-role client (the table is service-role-only).
export async function logDecision(
  admin: SupabaseClient,
  actorId: string | null,
  input: DecisionInput
): Promise<void> {
  try {
    const { error } = await admin.from("admin_decisions").insert({
      actor_id: actorId,
      actor_type: "human",
      action: input.action,
      subject_type: input.subjectType ?? null,
      subject_id: input.subjectId ?? null,
      reason: input.reason ?? null,
      metadata: input.metadata ?? {},
    });
    // 42P01 = table missing (addendum_047 not run yet). Silent no-op — the real
    // action already succeeded; the ledger simply starts recording once the SQL
    // lands. Anything else is a real bug worth a server log, but still not fatal.
    if (error && error.code !== "42P01") {
      console.error("logDecision failed:", error);
    }
  } catch (e) {
    console.error("logDecision threw:", e);
  }
}
