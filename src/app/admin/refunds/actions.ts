"use server";

import { revalidatePath } from "next/cache";
import { adminClient, requireAdmin } from "@/lib/supabase/admin-queries";
import { logDecision } from "@/lib/decision-ledger";
import { refundTicket } from "../actions";

// Approve a fan's refund request (#146): issue the refund through the existing
// refundTicket action (Stripe reversal + capacity release + decision ledger),
// then mark the request resolved. refundTicket re-checks everything and is
// idempotent on Stripe's side (idempotencyKey), so a double tap can't
// double-refund. If it blocks (e.g. the ticket was scanned at the door between
// request and approval), the request stays pending and the admin sees why.
export async function approveRefundRequest(requestId: string): Promise<{ error: string | null }> {
  const currentAdmin = await requireAdmin();
  const admin = adminClient();

  const { data: request } = await admin
    .from("refund_requests")
    .select("id, ticket_id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return { error: "Request not found" };
  if (request.status !== "pending") return { error: "This request was already resolved." };

  // Issue the refund first; if it fails, leave the request pending so it can be
  // retried rather than marked approved with no money moved.
  const result = await refundTicket(request.ticket_id);
  if (result.error) return { error: result.error };

  await admin
    .from("refund_requests")
    .update({
      status: "approved",
      resolved_at: new Date().toISOString(),
      resolved_by: currentAdmin.id,
    })
    .eq("id", requestId);

  revalidatePath("/admin/refunds");
  await logDecision(admin, currentAdmin.id, {
    action: "refund_request_approved",
    subjectType: "refund_request",
    subjectId: requestId,
    metadata: { ticketId: request.ticket_id },
  });
  return { error: null };
}

// Decline a request (policy is final sale unless cancelled). Optional note is
// for the admin's own record; nothing is sent to the fan automatically.
export async function declineRefundRequest(
  requestId: string,
  note: string
): Promise<{ error: string | null }> {
  const currentAdmin = await requireAdmin();
  const admin = adminClient();

  const { data: request } = await admin
    .from("refund_requests")
    .select("id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (!request) return { error: "Request not found" };
  if (request.status !== "pending") return { error: "This request was already resolved." };

  const cleanNote = note.trim().slice(0, 500) || null;
  const { error } = await admin
    .from("refund_requests")
    .update({
      status: "declined",
      admin_note: cleanNote,
      resolved_at: new Date().toISOString(),
      resolved_by: currentAdmin.id,
    })
    .eq("id", requestId);
  if (error) {
    console.error("declineRefundRequest failed:", error);
    return { error: "Couldn't update that request." };
  }

  revalidatePath("/admin/refunds");
  await logDecision(admin, currentAdmin.id, {
    action: "refund_request_declined",
    subjectType: "refund_request",
    subjectId: requestId,
  });
  return { error: null };
}
