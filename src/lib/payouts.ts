import type { SupabaseClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";
import { toCents } from "@/lib/pricing";

/**
 * Per-show settlement (#88, Vir 20 Sept 2026).
 *
 * THE PROBLEM. Stripe reports ONE balance per connected account. It has no idea
 * which show the money came from. So an organiser with last week's gig settled
 * and next month's still selling has both sitting in one number, and "release
 * the available balance" hands over ticket money for a show that hasn't happened
 * — which is exactly the sell-tickets-then-vanish hole the manual payout
 * schedule exists to close.
 *
 * THE FIX is that we don't need Stripe to segment anything: we already know, per
 * ticket, which show it was for and what the organiser's cut was. So the
 * releasable figure is computed HERE, from our own rows, and the payout is
 * created for that exact amount instead of for whatever the balance happens to
 * be. Stripe stays a wallet; the ledger is ours.
 *
 *   releasable = Σ net takings on shows past their hold date
 *              − Σ payouts already sent
 *
 * "Already sent" comes from Stripe's own payout history rather than a column of
 * ours, because that is the record of what actually left the account — a column
 * would be a second copy of the truth, free to drift the first time a payout
 * failed or was created by hand in the Stripe dashboard.
 */

// The Organiser Terms commit to it in writing: "the payout to your bank is
// released 7 days after the show has taken place".
export const PAYOUT_HOLD_DAYS = 7;

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface ShowSettlement {
  eventId: string;
  title: string;
  eventDate: string;
  /** event_date + PAYOUT_HOLD_DAYS. */
  dueDate: string;
  /** The organiser's cut of this show, net of MadGigz's fee and of refunds. */
  netCents: number;
  /** The hold has expired, so this show's money may be paid out. */
  due: boolean;
}

export interface OrganiserSettlement {
  /** Everything the organiser has earned across every show, net of fees. */
  earnedCents: number;
  /** Earned on shows whose hold has expired. */
  settledCents: number;
  /** Earned on shows still to happen (or inside the hold). Not payable yet. */
  heldCents: number;
  /** What Stripe has already sent to their bank. */
  paidOutCents: number;
  /** settledCents - paidOutCents, floored at zero. What a release should send. */
  releasableCents: number;
  shows: ShowSettlement[];
  /** Set when Stripe's payout history couldn't be read - see releasableCents. */
  payoutHistoryError: string | null;
}

/**
 * Sum of payouts that have left (or are leaving) the connected account.
 * Deliberately counts in-transit and pending ones: the money is committed, and
 * counting only completed payouts would let a second release go out on top of
 * one still in flight. Failed and cancelled payouts return to the balance, so
 * they are excluded.
 */
async function fetchPaidOutCents(stripeAccountId: string): Promise<number> {
  let total = 0;
  let startingAfter: string | undefined;

  // Paginated rather than a bare list(): the default page is 10, and an
  // organiser two years in would silently have most of their history ignored -
  // which would inflate releasable and pay them twice.
  for (let page = 0; page < 20; page += 1) {
    const batch = await stripe.payouts.list(
      { limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) },
      { stripeAccount: stripeAccountId }
    );
    for (const payout of batch.data) {
      if (payout.currency !== "eur") continue;
      if (payout.status === "failed" || payout.status === "canceled") continue;
      total += payout.amount;
    }
    if (!batch.has_more || batch.data.length === 0) break;
    startingAfter = batch.data[batch.data.length - 1].id;
  }
  return total;
}

/**
 * What this organiser has earned, per show, and how much of it may be released
 * right now. `admin` must be a service-role client: it reads ticket money and
 * the organiser's Stripe id, neither of which is granted to anyone else.
 */
export async function fetchOrganiserSettlement(
  admin: SupabaseClient,
  profileId: string,
  stripeAccountId: string | null,
  today: string = new Date().toISOString().slice(0, 10)
): Promise<OrganiserSettlement> {
  const empty: OrganiserSettlement = {
    earnedCents: 0,
    settledCents: 0,
    heldCents: 0,
    paidOutCents: 0,
    releasableCents: 0,
    shows: [],
    payoutHistoryError: null,
  };

  // Shows they run as an artist OR booked as a promoter/venue (#88). Before
  // addendum_051 the second half of that `or` is a column that doesn't exist,
  // so fall back to the artist-only query rather than returning nothing.
  let events: Array<{ id: string; title: string; event_date: string }> | null = null;
  const { data: bothKinds, error } = await admin
    .from("events")
    .select("id, title, event_date, cancelled")
    .or(`artist_id.eq.${profileId},pro_account_id.eq.${profileId}`)
    .eq("cancelled", false);

  if (error) {
    const { data: artistOnly } = await admin
      .from("events")
      .select("id, title, event_date, cancelled")
      .eq("artist_id", profileId)
      .eq("cancelled", false);
    events = artistOnly ?? [];
  } else {
    events = bothKinds ?? [];
  }

  if (events.length === 0) return empty;

  const { data: tickets } = await admin
    .from("tickets")
    .select("event_id, price_paid, application_fee_cents")
    .in(
      "event_id",
      events.map((e) => e.id)
    )
    .eq("refunded", false);

  // Net per show: what the fan paid, minus the fee Stripe took for MadGigz.
  // application_fee_cents is the WHOLE deduction (commission + IVA) - the
  // separate application_fee_vat_cents is a slice of it kept for tax reporting,
  // so subtracting both would take the IVA off twice.
  const netByEvent = new Map<string, number>();
  for (const ticket of tickets ?? []) {
    const net = toCents(Number(ticket.price_paid)) - (ticket.application_fee_cents ?? 0);
    netByEvent.set(ticket.event_id, (netByEvent.get(ticket.event_id) ?? 0) + Math.max(0, net));
  }

  const shows: ShowSettlement[] = events
    .map((event) => {
      const dueDate = addDays(event.event_date, PAYOUT_HOLD_DAYS);
      return {
        eventId: event.id,
        title: event.title,
        eventDate: event.event_date,
        dueDate,
        netCents: netByEvent.get(event.id) ?? 0,
        due: today >= dueDate,
      };
    })
    .filter((s) => s.netCents > 0)
    .sort((a, b) => a.eventDate.localeCompare(b.eventDate));

  const settledCents = shows.filter((s) => s.due).reduce((sum, s) => sum + s.netCents, 0);
  const heldCents = shows.filter((s) => !s.due).reduce((sum, s) => sum + s.netCents, 0);

  let paidOutCents = 0;
  let payoutHistoryError: string | null = null;
  if (stripeAccountId) {
    try {
      paidOutCents = await fetchPaidOutCents(stripeAccountId);
    } catch (e) {
      console.error(`Payout history lookup failed for ${stripeAccountId}:`, e);
      payoutHistoryError = "Couldn't read payout history";
    }
  }

  return {
    earnedCents: settledCents + heldCents,
    settledCents,
    heldCents,
    paidOutCents,
    // Floored at zero: a refund issued after a payout can legitimately push
    // this negative, and that is a debt to chase, not a payout to send.
    //
    // When the history lookup failed we report zero rather than the full
    // settled figure. Guessing high here pays somebody twice; guessing low
    // means an admin retries in a minute.
    releasableCents: payoutHistoryError ? 0 : Math.max(0, settledCents - paidOutCents),
    shows,
    payoutHistoryError,
  };
}
