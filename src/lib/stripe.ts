import Stripe from "stripe";

// Server-only: this module reads STRIPE_SECRET_KEY and must never be imported
// from a Client Component. Pure pricing math lives in @/lib/pricing so the
// artist-facing breakdown can share it without pulling Stripe into the bundle.
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// An artist can only sell through MadGigz once Stripe has enabled *transfers*
// on their connected account - destination charges need that specific
// capability, and charges_enabled alone can be true without it.
export function payoutsReady(account: Stripe.Account): boolean {
  return account.capabilities?.transfers === "active";
}
