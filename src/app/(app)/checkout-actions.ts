"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { applyDiscount, validateDiscountCode } from "@/lib/supabase/queries";
import { breakdownFor, formatEuros, toCents } from "@/lib/pricing";
import { EventRow, EventTierRow, mapEvent, mapEventTier, tierIsAvailable } from "@/lib/types";

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
  promoCode: string | null,
  tierId: string | null = null
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

  // The per-order cap is checked below once we know whether a tier was chosen:
  // a tiered show caps per ticket type (#151), a single-price show per event.
  // Either way it's enforced against the database value, not the client's.

  if (!event.active || event.cancelled) return { error: "That event is no longer on sale" };
  if (event.ticketing?.mode === "external") {
    return { error: "Tickets for this event are sold externally" };
  }

  const admin = createAdminClient();

  // You can't buy a ticket to your own show. The host (event.artistId) or any
  // act tagged on the lineup (event_artists) is performing, not attending -
  // selling them a paid seat is nonsense and, for the host, just charging
  // themselves the fee. Checked server-side so it holds regardless of the UI.
  if (event.artistId && event.artistId === user.id) {
    return { error: "You can't buy a ticket to your own show" };
  }
  const { data: taggedSelf } = await admin
    .from("event_artists")
    .select("event_id")
    .eq("event_id", event.id)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (taggedSelf) {
    return { error: "You're in this line-up, so you can't buy a ticket to this show" };
  }

  // The artist must be able to receive money before we take any. Read through
  // the admin client, not the buyer's: stripe_account_id is no longer granted
  // to authenticated (addendum_018), and a fan's session having any route to
  // another user's Stripe id was the wrong shape regardless.
  const { data: artist } = await admin
    .from("profiles")
    .select("stripe_account_id, stripe_payouts_ready")
    .eq("id", event.artistId ?? "")
    .maybeSingle();

  // Price tiers (#151): if the show has tiers, the fan must pick one, and its
  // price — not events.price — is the source of truth for the charge. Read
  // through the admin client so a missing table (pre-addendum_039) cleanly falls
  // back to the single price instead of erroring.
  const { data: tierRows, error: tiersError } = await admin
    .from("event_tiers")
    .select("*")
    .eq("event_id", event.id);
  const tiers = tiersError ? [] : ((tierRows as EventTierRow[]) ?? []).map(mapEventTier);

  let unitPriceEuros = event.price;
  let selectedTierId: string | null = null;
  let maxPerOrder = event.maxPerOrder;
  if (tiers.length > 0) {
    const tier = tierId ? tiers.find((t) => t.id === tierId) : null;
    if (!tier) return { error: "Choose a ticket type" };
    // Availability is re-checked here AND atomically at reservation below — this
    // gives a clean message, the reservation is what actually prevents oversell.
    if (!tierIsAvailable(tier)) return { error: "That ticket type isn't available" };
    unitPriceEuros = tier.price;
    selectedTierId = tier.id;
    maxPerOrder = tier.maxPerOrder;
  }

  // Per-order cap: the chosen type's for a tiered show, the event's otherwise.
  if (quantity > maxPerOrder) {
    return {
      error: `You can buy at most ${maxPerOrder} ${maxPerOrder === 1 ? "ticket" : "tickets"} per order`,
    };
  }

  // Price and discount both come from the database, never the client.
  const discount = promoCode ? await validateDiscountCode(supabase, promoCode, event.id) : null;
  if (promoCode && !discount) return { error: "That code isn't valid for this event" };

  const subtotalEuros = unitPriceEuros * quantity;
  const totalEuros = applyDiscount(subtotalEuros, discount);
  const totalCents = toCents(totalEuros);

  // Claim capacity before taking money, atomically - two fans racing for the
  // last seat can't both win. A tiered show reserves against the chosen tier
  // (which also bumps events.sold); a single-price show against the event.
  const { data: reserved, error: reserveError } = selectedTierId
    ? await admin.rpc("reserve_tier_capacity", { p_tier_id: selectedTierId, p_quantity: quantity })
    : await admin.rpc("reserve_event_capacity", { p_event_id: event.id, p_quantity: quantity });
  if (reserveError) {
    console.error("Capacity reservation failed:", reserveError);
    return { error: "Couldn't hold your tickets. Please try again." };
  }
  if (!reserved) return { error: "Not enough tickets left" };

  async function release() {
    if (selectedTierId) {
      await admin.rpc("release_tier_capacity", { p_tier_id: selectedTierId, p_quantity: quantity });
    } else {
      await admin.rpc("release_event_capacity", { p_event_id: event.id, p_quantity: quantity });
    }
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
      p_tier_id: selectedTierId,
    });

    if (error) {
      await release();
      console.error("Free ticket fulfilment failed:", error);
      return { error: "Couldn't issue your ticket. Please try again." };
    }
    if (!ticketId) {
      // Already had a free ticket for this event - give the capacity back.
      await release();
      return { error: "You already have a ticket for this event" };
    }

    revalidatePath("/saved");
    return { freeTicketId: ticketId as string };
  }

  // A MadGigz house show has no artist to pay: the money lands in the platform
  // account directly, so there is no Connect transfer and no commission to take
  // from ourselves. Everything else about checkout is identical.
  const houseRun = Boolean((eventRow as { house_run?: boolean }).house_run);

  if (!houseRun && (!artist?.stripe_payouts_ready || !artist.stripe_account_id)) {
    await release();
    return { error: "This artist can't accept payments yet" };
  }

  // Stripe collects the whole fee (commission + IVA) as one application fee;
  // the VAT portion is carried in metadata so it can be recorded separately on
  // the ticket for tax reporting. A house show is charged no fee at all.
  const { feeCents, feeVatCents } = houseRun
    ? { feeCents: 0, feeVatCents: 0 }
    : breakdownFor(totalCents);
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
      // Omitted entirely for a house show. Passing application_fee_amount: 0
      // with no destination is not the same thing - Stripe rejects a transfer
      // to nowhere, and a zero fee on a normal charge is a different intent.
      ...(houseRun
        ? {}
        : {
            payment_intent_data: {
              application_fee_amount: feeCents,
              transfer_data: { destination: artist!.stripe_account_id },
            },
          }),
      metadata: {
        event_id: event.id,
        user_id: user.id,
        quantity: String(quantity),
        discount_id: discount?.id ?? "",
        application_fee_cents: String(feeCents),
        application_fee_vat_cents: String(feeVatCents),
        stripe_account_id: houseRun ? "" : artist!.stripe_account_id,
        tier_id: selectedTierId ?? "",
      },
    });

    if (!session.url) {
      await release();
      return { error: "Could not start checkout" };
    }
    return { url: session.url };
  } catch (error) {
    await release();
    // Stripe's error text is written for developers and can echo key
    // fragments and account ids - log it, don't show it to a buyer.
    console.error("Checkout session creation failed:", error);
    return { error: "Couldn't start checkout. Please try again." };
  }
}

// Used by the promo field to preview a discount without creating a session.
// Validation is repeated server-side in createCheckout - this is display only.
export async function previewPromoCode(
  eventId: string,
  quantity: number,
  promoCode: string,
  tierId: string | null = null
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

  // A tiered show prices off the chosen tier, not events.price.
  let unitPrice = Number(eventRow.price);
  if (tierId) {
    const { data: tierRow } = await supabase
      .from("event_tiers")
      .select("price")
      .eq("id", tierId)
      .eq("event_id", eventId)
      .maybeSingle();
    if (tierRow) unitPrice = Number(tierRow.price);
  }

  const totalEuros = applyDiscount(unitPrice * quantity, discount);
  return {
    totalEuros,
    label:
      discount.type === "percent"
        ? `${discount.value}% off applied`
        : `${formatEuros(toCents(discount.value))} off applied`,
  };
}
