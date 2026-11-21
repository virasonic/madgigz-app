"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import {
  HOLD_TTL_SECONDS,
  attachSessionToHold,
  makeRoomForHold,
  openHold,
  releaseHold,
} from "@/lib/checkout-holds";
import { applyDiscount, validateDiscountCode } from "@/lib/supabase/queries";
import { breakdownFor, formatEuros, toCents } from "@/lib/pricing";
import {
  EventRow,
  EventTierRow,
  mapEvent,
  mapEventTier,
  tierIsAvailable,
} from "@/lib/types";
import { verifyTurnstileToken } from "@/app/(onboarding)/signup/turnstile-actions";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n/config";
import { resolveGuestBuyer } from "@/lib/guest-checkout";

export interface CheckoutResult {
  url?: string;
  freeTicketId?: string;
  error?: string;
  /**
   * Guest checkout only: the email already belongs to a finished MadGigz
   * account, so the modal offers sign-in instead of showing `error` raw.
   */
  code?: "hasAccount";
}

/** Who the ticket is for. A guest's id is the account made for their email. */
interface Buyer {
  id: string;
  email: string | undefined;
}

/** Set for a guest order (#234): what the webhook needs to email the ticket. */
interface GuestOrder {
  email: string;
  locale: Locale;
}

// A destination charge sits on the platform account, so the fan's card
// statement shows MadGigz's descriptor, not the artist's - identical for every
// show. Weeks usually pass between buying and the gig, and an unrecognised line
// on a statement is the most common reason a card holder opens a dispute, which
// on these charges is our liability, not the artist's. Appending the act's name
// makes the line self-explanatory: "MADGIGZ* VANGOURA".
//
// Sanitised hard rather than cleverly, because Stripe rejects the entire
// session on an invalid suffix - that would take down every paid checkout, not
// just the descriptor. Verified against the live API: "*", "<" and ">" are
// refused outright, and a suffix with no Latin character ("2026", or whitespace
// once a name like "1-800" is stripped) is refused too - hence the final test
// rather than just trimming. Accents are accepted by Stripe but folded anyway,
// since card statements themselves mangle non-ASCII.
//
// Length is NOT an error case: Stripe silently truncates the combined
// "prefix* suffix" to 22 characters. So the risk here is a suffix that gets cut
// to nothing, not a failed charge. 10 leaves the whole suffix visible behind a
// prefix of up to 10 - "MADGIGZ" (7) clears it. Behind a long prefix the suffix
// just disappears into the truncation, which is why the platform descriptor
// needs to stay short for this to be worth anything.
const DESCRIPTOR_SUFFIX_MAX = 10;

function statementDescriptorSuffix(name: string | null): string | undefined {
  if (!name) return undefined;
  const cleaned = name
    .normalize("NFD")
    // Combining marks must be deleted, not blanked: NFD splits "Vértice" into
    // "Ve" + accent + "rtice", so letting the next rule turn the accent into a
    // space would yield "Ve rtice".
    .replace(/\p{M}/gu, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, DESCRIPTOR_SUFFIX_MAX)
    .trim();
  // Stripe requires at least one latin letter, so a name that sanitises down to
  // digits alone ("2026") has to be dropped rather than sent.
  return /[A-Za-z]/.test(cleaned) ? cleaned : undefined;
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

  return startCheckout(
    { id: user.id, email: user.email },
    eventId,
    quantity,
    promoCode,
    tierId,
    null
  );
}

// Guest checkout (#234): a ticket with only an email, for shows an admin has
// opened to it. The account is made here, before any money moves, so the rest
// of checkout is the signed-in path with a different buyer - and the ticket
// row belongs to a real profile from the start. Paid shows only: a free ticket
// with no payment step would be a bot's account farm, so a €0 total is refused
// below. Turnstile stands in for the sign-in that normally gates this endpoint.
export async function createGuestCheckout(
  eventId: string,
  quantity: number,
  promoCode: string | null,
  tierId: string | null,
  guest: { email: string; turnstileToken: string | null; locale: string }
): Promise<CheckoutResult> {
  const email = guest.email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email))
    return { error: "Enter a valid email address" };

  // Same fail-closed rule as signup: a configured secret with no token is a
  // bot, not a glitch.
  if (process.env.TURNSTILE_SECRET_KEY) {
    const { success } = await verifyTurnstileToken(guest.turnstileToken ?? "");
    if (!success)
      return { error: "Couldn't verify you're human. Please try again." };
  }

  const admin = createAdminClient();
  // Read with the service role so a database without addendum_072 answers
  // "not offered" rather than erroring.
  const { data: flag, error: flagError } = await admin
    .from("events")
    .select("guest_checkout")
    .eq("id", eventId)
    .maybeSingle();
  if (flagError || !flag?.guest_checkout) {
    return {
      error: "Guest checkout isn't available for this show - sign in to buy",
    };
  }

  const buyer = await resolveGuestBuyer(admin, email);
  if (buyer.status === "hasAccount") {
    return {
      error: "This email already has a MadGigz account",
      code: "hasAccount",
    };
  }
  if (buyer.status === "error")
    return { error: "Couldn't start checkout. Please try again." };

  return startCheckout(
    { id: buyer.id, email },
    eventId,
    quantity,
    promoCode,
    tierId,
    {
      email,
      locale: isLocale(guest.locale) ? guest.locale : DEFAULT_LOCALE,
    }
  );
}

async function startCheckout(
  user: Buyer,
  eventId: string,
  quantity: number,
  promoCode: string | null,
  tierId: string | null,
  guest: GuestOrder | null
): Promise<CheckoutResult> {
  const supabase = await createClient();

  if (!Number.isInteger(quantity) || quantity < 1) {
    return { error: "Choose at least 1 ticket" };
  }

  const { data: eventRow } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .single();
  if (!eventRow) return { error: "That event no longer exists" };
  const event = mapEvent(eventRow as EventRow);

  // The per-order cap is checked below once we know whether a tier was chosen:
  // a tiered show caps per ticket type (#151), a single-price show per event.
  // Either way it's enforced against the database value, not the client's.

  if (!event.active || event.cancelled)
    return { error: "That event is no longer on sale" };
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
  // Same rule for the promoter or venue that booked it (#88): buying their own
  // ticket would just be paying MadGigz a commission on their own money.
  if (
    (eventRow as { pro_account_id?: string | null }).pro_account_id &&
    (eventRow as { pro_account_id?: string | null }).pro_account_id === user.id
  ) {
    return { error: "You can't buy a ticket to your own show" };
  }
  const { data: taggedSelf } = await admin
    .from("event_artists")
    .select("event_id")
    .eq("event_id", event.id)
    .eq("profile_id", user.id)
    .maybeSingle();
  if (taggedSelf) {
    return {
      error: "You're in this line-up, so you can't buy a ticket to this show",
    };
  }

  // Who gets paid for this show. Promoters and venues are organisers too (#88),
  // and when one of them booked the night the money is theirs, not the act's -
  // they settle with the artists themselves. pro_account_id therefore outranks
  // artist_id, and a show with neither is a MadGigz house show (below).
  //
  // Read through the admin client, not the buyer's: stripe_account_id is no
  // longer granted to authenticated (addendum_018), and a fan's session having
  // any route to another user's Stripe id was the wrong shape regardless.
  const proAccountId =
    (eventRow as { pro_account_id?: string | null }).pro_account_id ?? null;
  const payeeId = proAccountId ?? event.artistId;

  const { data: payee } = await admin
    .from("profiles")
    .select("stripe_account_id, stripe_payouts_ready")
    .eq("id", payeeId ?? "")
    .maybeSingle();

  // Price tiers (#151): if the show has tiers, the fan must pick one, and its
  // price — not events.price — is the source of truth for the charge. Read
  // through the admin client so a missing table (pre-addendum_039) cleanly falls
  // back to the single price instead of erroring.
  const { data: tierRows, error: tiersError } = await admin
    .from("event_tiers")
    .select("*")
    .eq("event_id", event.id);
  const tiers = tiersError
    ? []
    : ((tierRows as EventTierRow[]) ?? []).map(mapEventTier);

  let unitPriceEuros = event.price;
  let selectedTierId: string | null = null;
  let maxPerOrder = event.maxPerOrder;
  if (tiers.length > 0) {
    const tier = tierId ? tiers.find((t) => t.id === tierId) : null;
    if (!tier) return { error: "Choose a ticket type" };
    // Availability is re-checked here AND atomically at reservation below — this
    // gives a clean message, the reservation is what actually prevents oversell.
    if (!tierIsAvailable(tier))
      return { error: "That ticket type isn't available" };
    unitPriceEuros = tier.price;
    selectedTierId = tier.id;
    maxPerOrder = tier.maxPerOrder;
  }

  // Per-order cap: the chosen type's for a tiered show, the event's otherwise.
  if (quantity > maxPerOrder) {
    return {
      error: `You can buy at most ${maxPerOrder} ${
        maxPerOrder === 1 ? "ticket" : "tickets"
      } per order`,
    };
  }

  // Price and discount both come from the database, never the client.
  // Looked up with the service role: the discounts table must not be readable
  // from the browser (addendum_068 drops the public select policy), or anyone
  // could list every live code with the anon key.
  const discount = promoCode
    ? await validateDiscountCode(createAdminClient(), promoCode, event.id)
    : null;
  if (promoCode && !discount)
    return { error: "That code isn't valid for this event" };

  const subtotalEuros = unitPriceEuros * quantity;
  const totalEuros = applyDiscount(subtotalEuros, discount);
  const totalCents = toCents(totalEuros);

  // Paid shows only for guests (#234): the payment is the bot gate.
  if (guest && totalCents === 0) {
    return {
      error: "Free tickets need a MadGigz account - sign in to get yours",
    };
  }

  // A paid checkout holds seats until it is paid or expires. End this fan's
  // earlier unpaid checkout for the same show first, so coming back to checkout
  // doesn't hold the seats twice (#229).
  if (totalCents > 0) await makeRoomForHold(admin, user.id, event.id);

  // Claim capacity before taking money, atomically - two fans racing for the
  // last seat can't both win. A tiered show reserves against the chosen tier
  // (which also bumps events.sold); a single-price show against the event.
  const { data: reserved, error: reserveError } = selectedTierId
    ? await admin.rpc("reserve_tier_capacity", {
        p_tier_id: selectedTierId,
        p_quantity: quantity,
      })
    : await admin.rpc("reserve_event_capacity", {
        p_event_id: event.id,
        p_quantity: quantity,
      });
  if (reserveError) {
    console.error("Capacity reservation failed:", reserveError);
    return { error: "Couldn't hold your tickets. Please try again." };
  }
  if (!reserved) return { error: "Not enough tickets left" };

  // Set once the reservation is recorded as a hold (addendum_070). From then
  // on the hold is the only way the seats go back, so they can't go back twice.
  let holdId: string | null = null;

  async function release() {
    if (holdId) {
      try {
        await releaseHold(admin, holdId);
      } catch (error) {
        console.error("Checkout: couldn't release hold", error);
      }
      return;
    }
    if (selectedTierId) {
      await admin.rpc("release_tier_capacity", {
        p_tier_id: selectedTierId,
        p_quantity: quantity,
      });
    } else {
      await admin.rpc("release_event_capacity", {
        p_event_id: event.id,
        p_quantity: quantity,
      });
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

  if (!houseRun && (!payee?.stripe_payouts_ready || !payee.stripe_account_id)) {
    await release();
    // "organiser", not "artist": for a promoter's show the account that isn't
    // ready is the promoter's, and telling a fan the artist can't be paid would
    // be both wrong and unhelpful to whoever they complain to.
    return { error: "This organiser can't accept payments yet" };
  }

  // Record the hold. "full" means this account already has the maximum number
  // of unpaid checkouts open and none of them could be ended above.
  const hold = await openHold(admin, {
    userId: user.id,
    eventId: event.id,
    tierId: selectedTierId,
    quantity,
  });
  if (hold.status === "full") {
    await release();
    return {
      error:
        "You have too many checkouts open. Finish one, or try again in a few minutes.",
    };
  }
  if (hold.status === "open") holdId = hold.holdId;

  // Stripe collects the whole fee (commission + IVA) as one application fee;
  // the VAT portion is carried in metadata so it can be recorded separately on
  // the ticket for tax reporting. A house show is charged no fee at all.
  const { feeCents, feeVatCents } = houseRun
    ? { feeCents: 0, feeVatCents: 0 }
    : breakdownFor(totalCents);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const descriptorSuffix = statementDescriptorSuffix(event.artist);

  // Bizum (#144) is Spain's dominant consumer method, but it must be ACTIVATED
  // in the Stripe dashboard first — listing an unactivated method here makes
  // session creation throw and breaks checkout entirely. So it's env-gated
  // (STRIPE_ENABLE_BIZUM=true), the same fail-safe pattern the rest of the app
  // uses: enable Bizum in the dashboard, then set the flag, per environment.
  // It's an async method (settles after the redirect); the webhook already only
  // issues a ticket on payment_status "paid" / async_payment_succeeded and
  // releases the held seat on async_payment_failed / expired.
  const bizumEnabled = process.env.STRIPE_ENABLE_BIZUM === "true";

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: bizumEnabled ? ["card", "bizum"] : ["card"],
      // Abandoned checkouts release their held seats when this expires.
      expires_at: Math.floor(Date.now() / 1000) + HOLD_TTL_SECONDS,
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
      // The fee and transfer are omitted entirely for a house show. Passing
      // application_fee_amount: 0 with no destination is not the same thing -
      // Stripe rejects a transfer to nowhere, and a zero fee on a normal charge
      // is a different intent. The descriptor suffix applies either way: a house
      // show still bills the fan from the platform account.
      payment_intent_data: {
        ...(descriptorSuffix
          ? { statement_descriptor_suffix: descriptorSuffix }
          : {}),
        ...(houseRun
          ? {}
          : {
              application_fee_amount: feeCents,
              transfer_data: { destination: payee!.stripe_account_id },
            }),
      },
      metadata: {
        event_id: event.id,
        user_id: user.id,
        quantity: String(quantity),
        discount_id: discount?.id ?? "",
        application_fee_cents: String(feeCents),
        application_fee_vat_cents: String(feeVatCents),
        stripe_account_id: houseRun ? "" : payee!.stripe_account_id,
        tier_id: selectedTierId ?? "",
        // Lets the webhook release (or clear) exactly this hold, once.
        hold_id: holdId ?? "",
        // A guest order (#234): the webhook emails the ticket (with the
        // claim link) to this address in this language, since there is no
        // app session to show it in.
        guest: guest ? "1" : "",
        guest_email: guest?.email ?? "",
        guest_locale: guest?.locale ?? "",
      },
    });

    if (!session.url) {
      await release();
      return { error: "Could not start checkout" };
    }
    if (holdId) await attachSessionToHold(admin, holdId, session.id);
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

  const discount = await validateDiscountCode(
    createAdminClient(),
    promoCode,
    eventId
  );
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
