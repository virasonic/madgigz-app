"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { applyDiscount, validateDiscountCode } from "@/lib/supabase/queries";
import { breakdownFor, formatEuros, toCents } from "@/lib/pricing";
import { EventRow, mapEvent } from "@/lib/types";

export interface CheckoutResult {
  url?: string;
  freeTicketId?: string;
  error?: string;
}

// The only path to a ticket. Server Actions are public POST endpoints, so
// nothing the client sends about identity or price is trusted: the user comes
// from the session, the price from the database, and the discount is
// re-validated here even though the client already previewed it.
export async function createCheckout(
  eventId: string,
  quantity: number,
  promoCode: string | null
): Promise<CheckoutResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You need to be signed in to buy tickets" };

  if (!Number.isInteger(quantity) || quantity < 1) {
    return { error: "Choose at least 1 ticket" };
  }

  const { data: eventRow } = await supabase.from("events").select("*").eq("id", eventId).single();
  if (!eventRow) return { error: "That event no longer exists" };
  const event = mapEvent(eventRow as EventRow);

  // The per-order cap is enforced against the database value, not whatever the
  // client sent - the stepper's limit is a convenience, not a control.
  if (quantity > event.maxPerOrder) {
    return {
      error: `You can buy at most ${event.maxPerOrder} ${event.maxPerOrder === 1 ? "ticket" : "tickets"} per order for this event`,
    };
  }

  if (!event.active || event.cancelled) return { error: "That event is no longer on sale" };
  if (event.ticketing?.mode === "external") {
    return { error: "Tickets for this event are sold externally" };
  }

  // The artist must be able to receive money before we take any.
  const { data: artist } = await supabase
    .from("profiles")
    .select("stripe_account_id, stripe_payouts_ready")
    .eq("id", event.artistId ?? "")
    .maybeSingle();

  const admin = createAdminClient();

  // Price and discount both come from the database, never the client.
  const discount = promoCode ? await validateDiscountCode(supabase, promoCode, event.id) : null;
  if (promoCode && !discount) return { error: "That code isn't valid for this event" };

  const subtotalEuros = event.price * quantity;
  const totalEuros = applyDiscount(subtotalEuros, discount);
  const totalCents = toCents(totalEuros);

  // Claim capacity before taking money, atomically - two fans racing for the
  // last seat can't both win.
  const { data: reserved, error: reserveError } = await admin.rpc("reserve_event_capacity", {
    p_event_id: event.id,
    p_quantity: quantity,
  });
  if (reserveError) return { error: reserveError.message };
  if (!reserved) return { error: "Not enough tickets left" };

  async function release() {
    await admin.rpc("release_event_capacity", { p_event_id: event.id, p_quantity: quantity });
  }

  // Stripe rejects zero-amount sessions, so free tickets (a free event, or a
  // 100% discount) are issued directly. The session id is deterministic so a
  // double-submit is idempotent rather than issuing two tickets.
  if (totalCents === 0) {
    const { data: ticketId, error } = await admin.rpc("fulfil_ticket", {
      p_user_id: user.id,
      p_event_id: event.id,
      p_quantity: quantity,
      p_price_paid: 0,
      p_discount_id: discount?.id ?? null,
      p_stripe_session_id: `free:${user.id}:${event.id}`,
      p_stripe_payment_intent_id: null,
      p_application_fee_cents: 0,
      p_stripe_account_id: null,
      p_application_fee_vat_cents: 0,
    });

    if (error) {
      await release();
      return { error: error.message };
    }
    if (!ticketId) {
      // Already had a free ticket for this event - give the capacity back.
      await release();
      return { error: "You already have a ticket for this event" };
    }

    revalidatePath("/saved");
    return { freeTicketId: ticketId as string };
  }

  if (!artist?.stripe_payouts_ready || !artist.stripe_account_id) {
    await release();
    return { error: "This artist can't accept payments yet" };
  }

  // Stripe collects the whole fee (commission + IVA) as one application fee;
  // the VAT portion is carried in metadata so it can be recorded separately on
  // the ticket for tax reporting.
  const { feeCents, feeVatCents } = breakdownFor(totalCents);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      // Abandoned checkouts release their held seats when this expires.
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      success_url: `${appUrl}/checkout/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/feed?checkout=cancelled`,
      customer_email: user.email,
      line_items: [
        {
          quantity,
          price_data: {
            currency: "eur",
            // Unit price after any discount, so Stripe's own line maths agrees
            // with the total we computed.
            unit_amount: Math.round(totalCents / quantity),
            product_data: {
              name: event.title,
              description: `${event.venue} · ${event.date}`,
            },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: feeCents,
        transfer_data: { destination: artist.stripe_account_id },
      },
      metadata: {
        event_id: event.id,
        user_id: user.id,
        quantity: String(quantity),
        discount_id: discount?.id ?? "",
        application_fee_cents: String(feeCents),
        application_fee_vat_cents: String(feeVatCents),
        stripe_account_id: artist.stripe_account_id,
      },
    });

    if (!session.url) {
      await release();
      return { error: "Could not start checkout" };
    }
    return { url: session.url };
  } catch (error) {
    await release();
    return { error: error instanceof Error ? error.message : "Could not start checkout" };
  }
}

// Used by the promo field to preview a discount without creating a session.
// Validation is repeated server-side in createCheckout - this is display only.
export async function previewPromoCode(
  eventId: string,
  quantity: number,
  promoCode: string
): Promise<{ totalEuros?: number; label?: string; error?: string }> {
  const supabase = await createClient();
  const { data: eventRow } = await supabase
    .from("events")
    .select("price")
    .eq("id", eventId)
    .single();
  if (!eventRow) return { error: "That event no longer exists" };

  const discount = await validateDiscountCode(supabase, promoCode, eventId);
  if (!discount) return { error: "That code isn't valid for this event" };

  const totalEuros = applyDiscount(Number(eventRow.price) * quantity, discount);
  return {
    totalEuros,
    label:
      discount.type === "percent"
        ? `${discount.value}% off applied`
        : `${formatEuros(toCents(discount.value))} off applied`,
  };
}
