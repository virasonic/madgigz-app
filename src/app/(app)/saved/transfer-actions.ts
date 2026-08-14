"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Transfer / gift a ticket to another fan via a one-time claim link (#145).
//
// Same shape as saved/actions.ts: the session client establishes WHO is asking
// (auth.getUser), the service-role admin client does the privileged writes, and
// ownership / eligibility are checked here in code — there is no fan-writable RLS
// path onto tickets or ticket_transfers. A transfer only ever moves user_id (and
// rotates qr_secret); it never touches price_paid or the Stripe ids, so a later
// refund still lands on the original payer's card.

const TODAY = () => new Date().toISOString().slice(0, 10);

type TicketGuard = {
  id: string;
  user_id: string;
  event_id: string;
  refunded: boolean;
  checked_in_at: string | null;
  event_date: string | null;
};

// Loads a ticket with the one event field the eligibility checks need. Returns a
// flat shape; the events join comes back as an object (or null) from PostgREST.
async function loadTicket(
  admin: ReturnType<typeof createAdminClient>,
  ticketId: string
): Promise<TicketGuard | null> {
  const { data } = await admin
    .from("tickets")
    .select("id, user_id, event_id, refunded, checked_in_at, events(event_date)")
    .eq("id", ticketId)
    .maybeSingle();
  if (!data) return null;
  // PostgREST types a to-one embed as an array; at runtime it's a single object.
  // Handle both so the type-check and the real shape agree.
  const rawEv = data.events as unknown;
  const ev = (Array.isArray(rawEv) ? rawEv[0] : rawEv) as { event_date: string | null } | null;
  return {
    id: data.id,
    user_id: data.user_id,
    event_id: data.event_id,
    refunded: data.refunded,
    checked_in_at: data.checked_in_at,
    event_date: ev?.event_date ?? null,
  };
}

// A ticket can be handed on only while it is still a live, un-used ticket to an
// upcoming show. Shared by create and claim so the rules can't drift apart.
function transferableError(ticket: TicketGuard): string | null {
  if (ticket.refunded) return "This ticket was refunded and can't be transferred.";
  if (ticket.checked_in_at) return "This ticket has already been used at the door.";
  if (ticket.event_date && ticket.event_date < TODAY()) return "This show has already happened.";
  return null;
}

export type CreateTransferResult = { token: string; path: string } | { error: string };

// Sender taps "Transfer" on a ticket they hold → gets a claim link to share.
// Idempotent: if a live link already exists for this ticket, hand back the same
// one rather than minting a second (the unique index enforces one anyway).
export async function createTransfer(ticketId: string): Promise<CreateTransferResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const admin = createAdminClient();
  const ticket = await loadTicket(admin, ticketId);
  if (!ticket) return { error: "Ticket not found" };
  if (ticket.user_id !== user.id) return { error: "Not your ticket" };

  const blocked = transferableError(ticket);
  if (blocked) return { error: blocked };

  // Reuse an existing live link (one active transfer at a time).
  const { data: existing, error: existingError } = await admin
    .from("ticket_transfers")
    .select("token")
    .eq("ticket_id", ticketId)
    .eq("status", "pending")
    .maybeSingle();
  // 42P01 = table missing (addendum_037 not run yet): degrade to a clear message
  // rather than a 500, so a pre-migration deploy doesn't look broken.
  if (existingError && existingError.code === "42P01") {
    return { error: "Ticket transfer isn't available yet. Try again shortly." };
  }
  if (existing) return { token: existing.token, path: `/claim/${existing.token}` };

  const token = randomBytes(24).toString("base64url");
  const { error } = await admin.from("ticket_transfers").insert({
    ticket_id: ticketId,
    from_user_id: user.id,
    token,
    status: "pending",
  });
  if (error) {
    console.error("createTransfer failed:", error);
    return { error: "Couldn't create a transfer link. Please try again." };
  }

  revalidatePath("/saved");
  return { token, path: `/claim/${token}` };
}

// Sender changes their mind before anyone claims: cancels the live link, ticket
// stays theirs. No-op (harmless) if nothing is pending.
export async function cancelTransfer(ticketId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const admin = createAdminClient();
  const { error } = await admin
    .from("ticket_transfers")
    .update({ status: "cancelled" })
    .eq("ticket_id", ticketId)
    .eq("from_user_id", user.id)
    .eq("status", "pending");
  if (error && error.code !== "42P01") {
    console.error("cancelTransfer failed:", error);
    return { error: "Couldn't cancel the transfer. Please try again." };
  }

  revalidatePath("/saved");
  return { error: null };
}

export type ClaimTransferResult = { eventId: string } | { error: string };

// Recipient opens the link while signed in and taps "Claim". The transfer row is
// the lock: flipping it pending→claimed atomically means two people racing the
// same link — only one wins. Then ownership moves and the QR secret rotates, so
// the sender's old screenshot stops scanning at the door.
export async function claimTransfer(token: string): Promise<ClaimTransferResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in to claim this ticket." };

  const admin = createAdminClient();
  const { data: transfer, error: transferError } = await admin
    .from("ticket_transfers")
    .select("id, ticket_id, from_user_id, status")
    .eq("token", token)
    .maybeSingle();
  if (transferError && transferError.code === "42P01") {
    return { error: "Ticket transfer isn't available yet. Try again shortly." };
  }
  if (!transfer || transfer.status !== "pending") {
    return { error: "This transfer link is no longer valid." };
  }
  if (transfer.from_user_id === user.id) {
    return { error: "This is your own ticket — it's waiting for whoever you send the link to." };
  }

  const ticket = await loadTicket(admin, transfer.ticket_id);
  if (!ticket) return { error: "This transfer link is no longer valid." };
  const blocked = transferableError(ticket);
  if (blocked) return { error: blocked };

  // Claim the transfer row first (the lock). Zero rows back → already claimed.
  const { data: claimed, error: claimError } = await admin
    .from("ticket_transfers")
    .update({ status: "claimed", to_user_id: user.id, claimed_at: new Date().toISOString() })
    .eq("id", transfer.id)
    .eq("status", "pending")
    .select("id");
  if (claimError || !claimed || claimed.length === 0) {
    return { error: "This ticket was just claimed by someone else." };
  }

  // Move ownership and rotate the scan secret. Guarded on the previous owner so a
  // concurrent refund/transfer that changed the row can't be overwritten.
  const { error: moveError } = await admin
    .from("tickets")
    .update({ user_id: user.id, qr_secret: randomUUID() })
    .eq("id", ticket.id)
    .eq("user_id", transfer.from_user_id);
  if (moveError) {
    // Roll the lock back so the link can be retried rather than dead-ending.
    await admin
      .from("ticket_transfers")
      .update({ status: "pending", to_user_id: null, claimed_at: null })
      .eq("id", transfer.id);
    console.error("claimTransfer move failed:", moveError);
    return { error: "Couldn't claim the ticket. Please try again." };
  }

  revalidatePath("/saved");
  return { eventId: ticket.event_id };
}
