// Works out which ticket rows a payment's Stripe refunds correspond to (#229).
//
// One payment is one order of N per-seat ticket rows (addendum_036). A refund
// made from /admin carries metadata.ticket_id, so it names its own row. A refund
// made straight in the Stripe dashboard names nothing - it is just an amount -
// so the row has to be inferred, and only when the inference is unambiguous.
// Guessing wrong would void a seat nobody refunded, so anything that doesn't
// add up exactly is reported as unmatched instead of being forced onto a row.
//
// Pure on purpose: the webhook supplies rows and refunds, this decides.

export interface ReconcileTicket {
  id: string;
  priceCents: number;
  refunded: boolean;
  checkedIn: boolean;
  /** Seat index within the order; null on legacy one-row-per-order tickets. */
  seat: number | null;
}

export interface ReconcileRefund {
  amountCents: number;
  /** metadata.ticket_id, when the refund was created by the app. */
  ticketId: string | null;
}

export interface ReconcilePlan {
  /** Tickets to flip to refunded, in the order to do it. */
  markRefunded: string[];
  /** The subset of markRefunded inferred from an untagged (dashboard) refund. */
  inferred: string[];
  /** Refunded money that could not be pinned on a ticket. 0 when all accounted for. */
  unmatchedCents: number;
}

export function planRefundReconciliation(input: {
  tickets: ReconcileTicket[];
  /** Only refunds that moved (or will move) money: succeeded or pending. */
  refunds: ReconcileRefund[];
  /** charge.amount_refunded >= charge.amount */
  fullyRefunded: boolean;
}): ReconcilePlan {
  const { tickets, refunds, fullyRefunded } = input;
  const byId = new Map(tickets.map((t) => [t.id, t]));

  // 1. Refunds that name their ticket.
  const tagged = new Set<string>();
  for (const refund of refunds) {
    if (refund.ticketId && byId.has(refund.ticketId)) tagged.add(refund.ticketId);
  }
  const markRefunded = tickets.filter((t) => tagged.has(t.id) && !t.refunded).map((t) => t.id);
  const inferred: string[] = [];

  // 2. The whole payment went back: every row on it is void, no inference needed.
  if (fullyRefunded) {
    for (const t of tickets) {
      if (!t.refunded && !tagged.has(t.id)) {
        markRefunded.push(t.id);
        inferred.push(t.id);
      }
    }
    return { markRefunded, inferred, unmatchedCents: 0 };
  }

  // 3. Untagged refunds: dashboard refunds, plus in-app refunds from before the
  //    app tagged them. The latter already have their row marked, so that money
  //    is accounted for; only the remainder needs a home.
  const untaggedCents = refunds
    .filter((r) => !r.ticketId || !byId.has(r.ticketId))
    .reduce((sum, r) => sum + r.amountCents, 0);
  const coveredCents = tickets
    .filter((t) => t.refunded && !tagged.has(t.id))
    .reduce((sum, t) => sum + t.priceCents, 0);
  const gap = untaggedCents - coveredCents;
  if (gap <= 0) return { markRefunded, inferred, unmatchedCents: 0 };

  // Unused seats first (voiding a seat someone already walked in on changes
  // nothing at the door), then the highest seat number, so the choice is stable
  // across webhook retries.
  const candidates = tickets
    .filter((t) => !t.refunded && !tagged.has(t.id))
    .sort(
      (a, b) =>
        Number(a.checkedIn) - Number(b.checkedIn) || (b.seat ?? 0) - (a.seat ?? 0) || a.id.localeCompare(b.id)
    );

  let remaining = gap;
  const picked: string[] = [];
  for (const t of candidates) {
    if (t.priceCents > 0 && t.priceCents <= remaining) {
      picked.push(t.id);
      remaining -= t.priceCents;
    }
  }
  // Only an exact fit counts. €7 back on two €10 seats is a goodwill gesture,
  // not a voided ticket.
  if (remaining !== 0) return { markRefunded, inferred, unmatchedCents: gap };

  return { markRefunded: [...markRefunded, ...picked], inferred: picked, unmatchedCents: 0 };
}
