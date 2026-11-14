import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { logDecision } from "@/lib/decision-ledger";
import { sendOpsAlert } from "@/lib/email";
import { planRefundReconciliation } from "@/lib/refund-reconcile";

// Keeps ticket rows in step with money that moved at Stripe (#229).
//
// Before this, a refund was only known to the app if /admin made it. One issued
// from the Stripe dashboard, or a chargeback, left the ticket valid at the door
// and still counted in the organiser's takings - so the payout maths (which
// reads unrefunded tickets) offered to pay out money that had already gone back.
//
// Everything here is idempotent, because Stripe retries and because /admin's own
// refund races this webhook: a ticket is only ever flipped false -> true, and
// only whoever does the flip releases the seat.

interface TicketRow {
  id: string;
  event_id: string;
  quantity: number;
  price_paid: number | string;
  refunded: boolean;
  checked_in_at: string | null;
  tier_id: string | null;
  seat: number | null;
}

const TICKET_COLUMNS = "id, event_id, quantity, price_paid, refunded, checked_in_at, tier_id, seat";

function cents(price: number | string): number {
  return Math.round(Number(price) * 100);
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

async function ticketsForPayment(admin: SupabaseClient, paymentIntentId: string): Promise<TicketRow[]> {
  const { data, error } = await admin
    .from("tickets")
    .select(TICKET_COLUMNS)
    .eq("stripe_payment_intent_id", paymentIntentId);
  // Thrown, not swallowed: the webhook answers 500 and Stripe redelivers.
  if (error) throw new Error(`ticket lookup failed for ${paymentIntentId}: ${error.message}`);
  return (data ?? []) as TicketRow[];
}

// Flips one ticket to refunded. Returns true only if THIS call did the flip, so
// the caller knows whether the seat is its to release.
export async function markTicketRefunded(
  admin: SupabaseClient,
  ticket: Pick<TicketRow, "id" | "event_id" | "quantity" | "checked_in_at" | "tier_id">
): Promise<boolean> {
  const { data, error } = await admin
    .from("tickets")
    .update({ refunded: true })
    .eq("id", ticket.id)
    .eq("refunded", false)
    .select("id");
  if (error) throw new Error(`could not mark ticket ${ticket.id} refunded: ${error.message}`);
  if (!data || data.length === 0) return false;

  // A seat someone walked in on was physically used - it doesn't go back on sale.
  if (!ticket.checked_in_at) {
    const { error: releaseError } = ticket.tier_id
      ? await admin.rpc("release_tier_capacity", {
          p_tier_id: ticket.tier_id,
          p_quantity: ticket.quantity,
        })
      : await admin.rpc("release_event_capacity", {
          p_event_id: ticket.event_id,
          p_quantity: ticket.quantity,
        });
    // Logged, not thrown: the flip is done, so a retry would find nothing to
    // flip and never get back here. Over-holding one seat is the safe failure.
    if (releaseError) {
      console.error(`Seat not released for refunded ticket ${ticket.id}:`, releaseError);
    }
  }
  return true;
}

// charge.refunded - fires for every refund on a payment, ours included.
export async function syncChargeRefund(charge: Stripe.Charge) {
  const paymentIntentId = idOf(charge.payment_intent);
  if (!paymentIntentId) return;

  const admin = createAdminClient();
  const tickets = await ticketsForPayment(admin, paymentIntentId);
  // Not a ticket payment we know (or one whose fulfilment never landed).
  if (tickets.length === 0) return;

  const refunds = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100 });
  const live = refunds.data.filter((r) => r.status === "succeeded" || r.status === "pending");

  const plan = planRefundReconciliation({
    tickets: tickets.map((t) => ({
      id: t.id,
      priceCents: cents(t.price_paid),
      refunded: t.refunded,
      checkedIn: Boolean(t.checked_in_at),
      seat: t.seat,
    })),
    refunds: live.map((r) => ({ amountCents: r.amount, ticketId: r.metadata?.ticket_id ?? null })),
    fullyRefunded: charge.amount_refunded >= charge.amount,
  });

  // Voluntary refunds (#210) keep MadGigz's fee, and billing only knows that
  // from tickets.fee_retained. /admin sets it itself; this covers the case where
  // its own write failed after the money moved.
  const feeRetained = new Set(
    live.filter((r) => r.metadata?.kind === "voluntary" && r.metadata?.ticket_id).map((r) => r.metadata!.ticket_id)
  );

  const byId = new Map(tickets.map((t) => [t.id, t]));
  for (const id of plan.markRefunded) {
    const ticket = byId.get(id)!;
    const flipped = await markTicketRefunded(admin, ticket);
    if (feeRetained.has(id)) {
      // Best-effort: the column arrives with addendum_058, run by hand.
      const { error } = await admin.from("tickets").update({ fee_retained: true }).eq("id", id);
      if (error) console.error(`fee_retained not set on ticket ${id}:`, error);
    }
    // Only refunds nobody in /admin made are news; the app logs its own.
    if (flipped && plan.inferred.includes(id)) {
      await logDecision(admin, null, {
        action: "ticket_refunded",
        subjectType: "ticket",
        subjectId: id,
        reason: "Refunded outside the app (Stripe dashboard); ticket voided by the webhook.",
        metadata: { eventId: ticket.event_id, amount: Number(ticket.price_paid), paymentIntentId, source: "stripe" },
      });
    }
  }

  if (plan.unmatchedCents > 0) {
    await logDecision(admin, null, {
      action: "refund_unmatched",
      subjectType: "payment",
      subjectId: paymentIntentId,
      reason: "A Stripe refund fits no whole ticket on this payment; no ticket was voided.",
      metadata: { unmatchedCents: plan.unmatchedCents, eventId: tickets[0].event_id, ticketIds: tickets.map((t) => t.id) },
    });
    await sendOpsAlert({
      subject: `refund of €${(plan.unmatchedCents / 100).toFixed(2)} matches no ticket`,
      lines: [
        `A refund was made in Stripe on payment ${paymentIntentId} that doesn't add up to a whole ticket.`,
        "",
        "No ticket was voided, so every ticket on this order still scans at the door and still counts",
        "towards the organiser's payout. If the refund was meant to cancel a ticket, refund that ticket",
        "from /admin/billing instead (or tell the developer which ticket to void).",
        "",
        `Event: ${tickets[0].event_id}`,
        `Tickets on this payment: ${tickets.map((t) => t.id).join(", ")}`,
      ],
    });
  }
}

// charge.dispute.created / charge.dispute.closed.
//
// MadGigz is the platform on a destination charge, so a chargeback is debited
// from MadGigz, not the organiser. Nothing here moves money: opening a dispute
// only raises the alarm (there is a deadline to answer it), and a LOST dispute
// voids the tickets, which takes them out of the organiser's takings so the next
// payout isn't computed on money that went back to the cardholder.
export async function syncDispute(dispute: Stripe.Dispute, type: "created" | "closed") {
  const paymentIntentId = idOf(dispute.payment_intent);
  if (!paymentIntentId) return;

  const admin = createAdminClient();
  const tickets = await ticketsForPayment(admin, paymentIntentId);
  if (tickets.length === 0) return;

  const amount = `€${(dispute.amount / 100).toFixed(2)}`;
  const context = [
    "",
    `Payment: ${paymentIntentId}`,
    `Dispute: ${dispute.id} (reason: ${dispute.reason})`,
    `Event: ${tickets[0].event_id}`,
    `Tickets: ${tickets.map((t) => t.id).join(", ")}`,
  ];

  if (type === "created") {
    await logDecision(admin, null, {
      action: "dispute_opened",
      subjectType: "payment",
      subjectId: paymentIntentId,
      reason: `Cardholder disputed ${amount} (${dispute.reason}).`,
      metadata: { disputeId: dispute.id, amountCents: dispute.amount, eventId: tickets[0].event_id },
    });
    await sendOpsAlert({
      subject: `chargeback opened for ${amount}`,
      lines: [
        `A cardholder has disputed a ticket payment of ${amount}.`,
        "Stripe has taken the amount (plus its dispute fee) from the MadGigz balance while it is open.",
        "Answer it in the Stripe dashboard before the deadline shown there - an unanswered dispute is lost.",
        "The tickets stay valid for now.",
        ...context,
      ],
    });
    return;
  }

  if (dispute.status !== "lost") {
    await logDecision(admin, null, {
      action: "dispute_closed",
      subjectType: "payment",
      subjectId: paymentIntentId,
      reason: `Dispute closed: ${dispute.status}.`,
      metadata: { disputeId: dispute.id, status: dispute.status },
    });
    return;
  }

  // Lost. Void the tickets only if the dispute covers everything still standing
  // on the order; a partial dispute can't be pinned on a seat.
  const standing = tickets.filter((t) => !t.refunded);
  const standingCents = standing.reduce((sum, t) => sum + cents(t.price_paid), 0);
  const covers = standing.length > 0 && dispute.amount >= standingCents;
  if (covers) {
    for (const ticket of standing) await markTicketRefunded(admin, ticket);
  }

  await logDecision(admin, null, {
    action: "dispute_lost",
    subjectType: "payment",
    subjectId: paymentIntentId,
    reason: covers
      ? `Chargeback of ${amount} lost; tickets voided.`
      : `Chargeback of ${amount} lost; it doesn't cover the whole order, so no ticket was voided.`,
    metadata: {
      disputeId: dispute.id,
      amountCents: dispute.amount,
      eventId: tickets[0].event_id,
      voided: covers ? standing.map((t) => t.id) : [],
    },
  });
  await sendOpsAlert({
    subject: `chargeback lost for ${amount}`,
    lines: [
      `A chargeback of ${amount} was lost. The money has gone back to the cardholder out of the MadGigz balance.`,
      covers
        ? "The tickets on this order have been voided, so they no longer count towards the organiser's payout."
        : "It doesn't cover the whole order, so NO ticket was voided - decide by hand which one to refund in /admin/billing.",
      "The organiser's Stripe balance still holds their share of this sale. Reverse the transfer in the",
      "Stripe dashboard if it hasn't been paid out yet; nothing does that automatically.",
      ...context,
    ],
  });
}
