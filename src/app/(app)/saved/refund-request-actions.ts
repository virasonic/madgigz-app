"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Fan-initiated refund REQUESTS (#146). Same shape as transfer-actions: the
// session client establishes WHO is asking (auth.getUser), the service-role
// admin client does the write, and ownership + eligibility are checked here in
// code. A request only ever adds a row to the admin queue — issuing the refund
// (and moving money) stays the admin action refundTicket (#51), fired on
// approval from /admin/refunds. The policy is "final sale unless cancelled", so
// a request is an ask, not an entitlement.

const TODAY = () => new Date().toISOString().slice(0, 10);
const REASON_MAX = 500;

type TicketGuard = {
  id: string;
  user_id: string;
  refunded: boolean;
  checked_in_at: string | null;
  event_date: string | null;
};

async function loadTicket(
  admin: ReturnType<typeof createAdminClient>,
  ticketId: string
): Promise<TicketGuard | null> {
  const { data } = await admin
    .from("tickets")
    .select("id, user_id, refunded, checked_in_at, events(event_date)")
    .eq("id", ticketId)
    .maybeSingle();
  if (!data) return null;
  // PostgREST types a to-one embed as an array; at runtime it's a single object.
  const rawEv = data.events as unknown;
  const ev = (Array.isArray(rawEv) ? rawEv[0] : rawEv) as { event_date: string | null } | null;
  return {
    id: data.id,
    user_id: data.user_id,
    refunded: data.refunded,
    checked_in_at: data.checked_in_at,
    event_date: ev?.event_date ?? null,
  };
}

// A refund can be requested only while the ticket is still live, unused and the
// show hasn't happened — past that there's nothing a refund can do.
function requestableError(ticket: TicketGuard): string | null {
  if (ticket.refunded) return "This ticket has already been refunded.";
  if (ticket.checked_in_at) return "This ticket was already used at the door.";
  if (ticket.event_date && ticket.event_date < TODAY()) return "This show has already happened.";
  return null;
}

// Fan taps "Request a refund" on a ticket they hold → a pending row lands in the
// admin queue. One pending request per ticket (the partial unique index).
export async function requestRefund(
  ticketId: string,
  reason: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const admin = createAdminClient();
  const ticket = await loadTicket(admin, ticketId);
  if (!ticket) return { error: "Ticket not found" };
  if (ticket.user_id !== user.id) return { error: "Not your ticket" };

  const blocked = requestableError(ticket);
  if (blocked) return { error: blocked };

  const cleanReason = reason.trim().slice(0, REASON_MAX) || null;
  const { error } = await admin.from("refund_requests").insert({
    ticket_id: ticketId,
    user_id: user.id,
    reason: cleanReason,
  });
  if (error) {
    // 42P01 = table missing (addendum_056 not run); 23505 = one already pending.
    if (error.code === "42P01") {
      return { error: "Refund requests aren't available yet. Try again shortly." };
    }
    if (error.code === "23505") {
      return { error: "You've already requested a refund for this ticket." };
    }
    console.error("requestRefund failed:", error);
    return { error: "Couldn't send your refund request. Please try again." };
  }

  revalidatePath("/saved");
  return { error: null };
}

// Fan changes their mind before an admin resolves it: deletes their own pending
// request. No-op (harmless) if nothing is pending.
export async function cancelRefundRequest(ticketId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("refund_requests")
    .delete()
    .eq("ticket_id", ticketId)
    .eq("user_id", user.id)
    .eq("status", "pending");
  if (error && error.code !== "42P01") {
    console.error("cancelRefundRequest failed:", error);
    return { error: "Couldn't cancel your request. Please try again." };
  }

  revalidatePath("/saved");
  return { error: null };
}
