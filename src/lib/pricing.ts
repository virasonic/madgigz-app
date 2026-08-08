// Pure pricing math, shared by server (Stripe amounts, fee calculation) and
// client (the artist-facing breakdown in Add Show). Deliberately has no Stripe
// import so it stays safe to pull into Client Components.
//
// The fee rate is NEXT_PUBLIC_ because it isn't a secret - artists and fans see
// it in the UI - and having one variable rather than a public/private pair
// removes any chance of the displayed rate drifting from the charged one.
export const FEE_PERCENT = Number(process.env.NEXT_PUBLIC_MADGIGZ_FEE_PERCENT ?? 10);

// Stripe works in integer cents; events.price is euros numeric(10,2). Every
// conversion goes through here so the euros/cents boundary lives in one place -
// mixing the two is the classic way to charge someone 2 cents instead of EUR2.
export function toCents(euros: number): number {
  return Math.round(euros * 100);
}

export function toEuros(cents: number): number {
  return Math.round(cents) / 100;
}

export function feeCentsFor(totalCents: number): number {
  return Math.round((totalCents * FEE_PERCENT) / 100);
}

export interface PriceBreakdown {
  fanPaysCents: number;
  feeCents: number;
  artistReceivesCents: number;
}

// MadGigz takes a percentage of each ticket and the artist absorbs it: a EUR20
// ticket costs the fan EUR20 and pays the artist EUR18 at 10%.
export function breakdownFor(totalCents: number): PriceBreakdown {
  const feeCents = feeCentsFor(totalCents);
  return {
    fanPaysCents: totalCents,
    feeCents,
    artistReceivesCents: totalCents - feeCents,
  };
}

export function formatEuros(cents: number): string {
  return `€${toEuros(cents).toFixed(2)}`;
}
