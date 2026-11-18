import type { SupabaseClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";

// Unpaid checkout holds (#229, addendum_070).
//
// createCheckout reserves seats before the fan pays. Each reservation is
// recorded as a checkout_holds row so that:
//   * one account can't hold seats on more than MAX_OPEN_HOLDS checkouts at once
//     (otherwise a show can be made to look sold out without paying), and
//   * giving seats back is idempotent - release_checkout_hold deletes the row
//     and returns the seats in one transaction, so a second attempt (a duplicate
//     webhook, or the webhook after we already released) does nothing.
//
// The table and functions arrive by hand-run SQL. Until then every function
// here reports "off" and checkout behaves exactly as it did before.

const MAX_OPEN_HOLDS = 3;
/** Also the Stripe session's lifetime in createCheckout (Stripe's minimum is 30 minutes). */
export const HOLD_TTL_SECONDS = 30 * 60;

// Table or function not there yet: 42P01 / PGRST205 (table), 42883 / PGRST202
// (function), as PostgREST reports them on staging and prod.
const MISSING = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);

interface OpenHold {
  id: string;
  event_id: string;
  stripe_session_id: string | null;
}

// Ends one unpaid checkout and gives its seats back. The Stripe session is
// expired FIRST: once that succeeds it can no longer be paid, so releasing the
// seats is safe. If expiring fails the session was paid or has already expired,
// and fulfilment or the webhook will settle the hold - leave it alone.
async function dropHold(admin: SupabaseClient, hold: OpenHold): Promise<boolean> {
  // No session id means Stripe hasn't answered yet (a checkout in flight).
  if (!hold.stripe_session_id) return false;
  try {
    await stripe.checkout.sessions.expire(hold.stripe_session_id);
  } catch {
    return false;
  }
  const { error } = await admin.rpc("release_checkout_hold", { p_hold_id: hold.id });
  if (error) {
    // The session.expired webhook carries the hold id and will retry this.
    console.error(`checkout hold ${hold.id}: expired at Stripe but release failed`, error);
    return false;
  }
  return true;
}

/**
 * Called before reserving seats for a new checkout. Ends the fan's earlier
 * unpaid checkout for the same show (so re-opening checkout doesn't hold the
 * seats twice), and if they are at the cap, their oldest ones elsewhere.
 * Best effort: the cap itself is enforced by openHold.
 */
export async function makeRoomForHold(
  admin: SupabaseClient,
  userId: string,
  eventId: string
): Promise<void> {
  const { data, error } = await admin
    .from("checkout_holds")
    .select("id, event_id, stripe_session_id")
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });
  if (error) {
    if (!MISSING.has(error.code ?? "")) console.error("checkout holds: read failed", error);
    return;
  }

  const holds = (data ?? []) as OpenHold[];
  let open = holds.length;
  for (const hold of holds.filter((h) => h.event_id === eventId)) {
    if (await dropHold(admin, hold)) open -= 1;
  }
  for (const hold of holds.filter((h) => h.event_id !== eventId)) {
    if (open < MAX_OPEN_HOLDS) break;
    if (await dropHold(admin, hold)) open -= 1;
  }
}

export type OpenHoldResult =
  | { status: "open"; holdId: string }
  /** The account already has MAX_OPEN_HOLDS live checkouts. */
  | { status: "full" }
  /** addendum_070 not run (or the call failed): carry on without a hold. */
  | { status: "off" };

/** Records the hold for seats that have just been reserved. */
export async function openHold(
  admin: SupabaseClient,
  input: { userId: string; eventId: string; tierId: string | null; quantity: number }
): Promise<OpenHoldResult> {
  const { data, error } = await admin.rpc("open_checkout_hold", {
    p_user_id: input.userId,
    p_event_id: input.eventId,
    p_tier_id: input.tierId,
    p_quantity: input.quantity,
    p_ttl_seconds: HOLD_TTL_SECONDS,
    p_max_open: MAX_OPEN_HOLDS,
  });
  if (error) {
    // Failing open is deliberate: a broken limiter must not stop ticket sales.
    if (!MISSING.has(error.code ?? "")) console.error("checkout holds: open failed", error);
    return { status: "off" };
  }
  return data ? { status: "open", holdId: data as string } : { status: "full" };
}

/** Ties the hold to its Stripe session so a later checkout can end it. */
export async function attachSessionToHold(
  admin: SupabaseClient,
  holdId: string,
  sessionId: string
): Promise<void> {
  const { error } = await admin
    .from("checkout_holds")
    .update({ stripe_session_id: sessionId })
    .eq("id", holdId);
  if (error) console.error(`checkout hold ${holdId}: couldn't attach session`, error);
}

/**
 * Gives a hold's seats back, once. Resolves to whether THIS call released them.
 * Throws on a database error so a webhook caller answers 500 and Stripe retries.
 */
export async function releaseHold(admin: SupabaseClient, holdId: string): Promise<boolean> {
  const { data, error } = await admin.rpc("release_checkout_hold", { p_hold_id: holdId });
  if (error) throw new Error(`checkout hold ${holdId}: release failed: ${error.message}`);
  return Boolean(data);
}

/**
 * The checkout was paid: the seats are now a ticket, so the hold just goes away
 * without releasing anything. Never throws - the ticket is already issued, and a
 * leftover row only counts against the cap until it expires.
 */
export async function settleHold(admin: SupabaseClient, holdId: string): Promise<void> {
  const { error } = await admin.from("checkout_holds").delete().eq("id", holdId);
  if (error) console.error(`checkout hold ${holdId}: couldn't clear after payment`, error);
}
