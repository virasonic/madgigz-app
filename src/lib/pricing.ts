// Pure pricing math, shared by server (Stripe amounts, fee calculation) and
// client (the artist-facing breakdown in Add Show). Deliberately has no Stripe
// import so it stays safe to pull into Client Components.
//
// These are NEXT_PUBLIC_ because they aren't secrets - artists and fans see the
// rates in the UI - and having one variable per rate rather than a
// public/private pair removes any chance of the displayed rate drifting from
// the charged one.
export const FEE_PERCENT = Number(process.env.NEXT_PUBLIC_MADGIGZ_FEE_PERCENT ?? 5);

// Spanish IVA on MadGigz's own service fee. This is not a tax on the ticket -
// it applies only to the commission, and it's collected on behalf of Hacienda
// rather than earned, so it's tracked separately from revenue everywhere.
export const VAT_PERCENT = Number(process.env.NEXT_PUBLIC_MADGIGZ_VAT_PERCENT ?? 21);

// Commission floor, applied before VAT. Without it, cheap tickets cost more to
// process than they earn: our checkout is a destination charge, so the PLATFORM
// (not the artist) pays Stripe's fee of 1.5% + EUR0.25 per sale. Our margin on a
// ticket is feeBase - stripeFee; the floor only binds while 5% is below it, i.e.
// under ~EUR7.20, exactly the band where a bare 5% loses money. EUR0.36 is the
// break-even at that crossover (0.7 * floor = 25c); anything lower loses money on
// a ~EUR7 ticket. Do NOT drop this below 36 without redoing that math - and note
// non-EEA cards (2.5-3.25%) and refunds (Stripe keeps its fee) still erode it.
export const MIN_FEE_CENTS = Number(process.env.NEXT_PUBLIC_MADGIGZ_MIN_FEE_CENTS ?? 36);

// Stripe works in integer cents; events.price is euros numeric(10,2). Every
// conversion goes through here so the euros/cents boundary lives in one place -
// mixing the two is the classic way to charge someone 2 cents instead of EUR2.
export function toCents(euros: number): number {
  return Math.round(euros * 100);
}

export function toEuros(cents: number): number {
  return Math.round(cents) / 100;
}

// Parse a user-typed price into a euros number, accepting BOTH the European
// decimal comma ("21,50") and a dot ("21.50"). A Spanish phone's number pad
// emits a comma, and Number("21,5") is NaN - which silently read as a free
// ticket in the price editor. Returns NaN for anything unparseable, so callers
// keep their existing Number.isNaN guards.
export function parseEuros(input: string): number {
  return Number(input.trim().replace(",", "."));
}

export interface PriceBreakdown {
  fanPaysCents: number;
  /** MadGigz's actual commission, before tax. */
  feeBaseCents: number;
  /** IVA on the commission - owed to Hacienda, not revenue. */
  feeVatCents: number;
  /** What's deducted from the artist in total (base + VAT). */
  feeCents: number;
  artistReceivesCents: number;
}

// MadGigz takes a percentage of each ticket and the artist absorbs it: the
// price the artist sets is exactly what the fan pays.
export function breakdownFor(totalCents: number): PriceBreakdown {
  if (totalCents <= 0) {
    return {
      fanPaysCents: 0,
      feeBaseCents: 0,
      feeVatCents: 0,
      feeCents: 0,
      artistReceivesCents: 0,
    };
  }

  const feeBaseCents = Math.max(
    Math.round((totalCents * FEE_PERCENT) / 100),
    MIN_FEE_CENTS
  );
  const feeVatCents = Math.round((feeBaseCents * VAT_PERCENT) / 100);
  const feeCents = feeBaseCents + feeVatCents;

  return {
    fanPaysCents: totalCents,
    feeBaseCents,
    feeVatCents,
    feeCents,
    // A fee floor can exceed a very cheap ticket; never hand back a negative.
    artistReceivesCents: Math.max(totalCents - feeCents, 0),
  };
}

export function formatEuros(cents: number): string {
  return `€${toEuros(cents).toFixed(2)}`;
}
