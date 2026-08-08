import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { toEuros } from "@/lib/pricing";

// Turning a paid Checkout Session into a ticket. Deliberately shared between
// the webhook and the success-page reconciliation: the browser often gets back
// before Stripe's webhook lands, so both paths race and whichever arrives first
// wins. fulfil_ticket is idempotent (unique stripe_session_id + on conflict do
// nothing), so the loser is a harmless no-op.
export async function fulfilCheckoutSession(session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return { fulfilled: false, reason: "not_paid" as const };

  const meta = session.metadata ?? {};
  const userId = meta.user_id;
  const eventId = meta.event_id;
  const quantity = Number(meta.quantity ?? 0);

  if (!userId || !eventId || !quantity) {
    return { fulfilled: false, reason: "missing_metadata" as const };
  }

  const admin = createAdminClient();
  const { data: ticketId, error } = await admin.rpc("fulfil_ticket", {
    p_user_id: userId,
    p_event_id: eventId,
    p_quantity: quantity,
    p_price_paid: toEuros(session.amount_total ?? 0),
    p_discount_id: meta.discount_id || null,
    p_stripe_session_id: session.id,
    p_stripe_payment_intent_id:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? null),
    p_application_fee_cents: Number(meta.application_fee_cents ?? 0),
    p_stripe_account_id: meta.stripe_account_id || null,
  });

  if (error) throw error;

  // null ticketId means this session was already fulfilled - still a success
  // from the caller's point of view (a webhook retry must not 500, or Stripe
  // keeps retrying forever).
  return { fulfilled: true, ticketId: ticketId as string | null };
}
