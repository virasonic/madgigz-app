import Stripe from "stripe";

// Server-only: this module reads STRIPE_SECRET_KEY and must never be imported
// from a Client Component. Pure pricing math lives in @/lib/pricing so the
// artist-facing breakdown can share it without pulling Stripe into the bundle.

let client: Stripe | null = null;

function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    // Deliberately thrown on first *use*, not at module load. Next evaluates
    // imported modules while building, so a top-level throw here took down the
    // entire deployment - landing page included - whenever the key was absent,
    // rather than just the payment paths that actually need it.
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    client = new Stripe(key);
  }
  return client;
}

// Proxied so call sites keep the natural `stripe.checkout.sessions.create(...)`
// shape while construction stays lazy.
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    return Reflect.get(getStripe(), prop, receiver);
  },
});

// An artist can only sell through MadGigz once Stripe has enabled *transfers*
// on their connected account - destination charges need that specific
// capability, and charges_enabled alone can be true without it.
export function payoutsReady(account: Stripe.Account): boolean {
  return account.capabilities?.transfers === "active";
}
