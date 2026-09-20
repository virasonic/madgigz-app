import Link from "next/link";
import { Suspense } from "react";
import { stripe } from "@/lib/stripe";
import { FEE_PERCENT, MIN_FEE_CENTS, VAT_PERCENT, toEuros } from "@/lib/pricing";
import { proClient, requirePro } from "@/lib/supabase/pro-queries";
import PayoutConnect from "./PayoutConnect";

function euros(amount: number): string {
  return `€${amount.toFixed(2)}`;
}

// Stripe is a network call that can fail or be slow, and a payouts page that
// 500s because a balance lookup timed out would also hide the Connect button -
// the one thing someone with no balance came here for.
async function fetchBalance(accountId: string | null) {
  if (!accountId) return null;
  try {
    const balance = await stripe.balance.retrieve({}, { stripeAccount: accountId });
    return {
      available: balance.available.find((b) => b.currency === "eur")?.amount ?? 0,
      pending: balance.pending.find((b) => b.currency === "eur")?.amount ?? 0,
    };
  } catch (error) {
    console.error(`Balance lookup failed for ${accountId}:`, error);
    return null;
  }
}

export default async function ProPayoutsPage() {
  const { userId, account } = await requirePro();

  const { data: profile } = await proClient()
    .from("profiles")
    .select("stripe_account_id, stripe_payouts_ready")
    .eq("id", userId)
    .maybeSingle();

  const accountId = (profile?.stripe_account_id as string | null) ?? null;
  const ready = Boolean(profile?.stripe_payouts_ready);
  const balance = ready ? await fetchBalance(accountId) : null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl text-foreground">Payouts</h1>
        <p className="text-sm text-muted">
          Ticket money for your shows is collected into your own Stripe account.
        </p>
      </div>

      <div className="rounded-2xl bg-surface p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-heading text-lg text-foreground">Your Stripe account</h2>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-heading ${
              ready ? "bg-accent/15 text-accent" : "bg-primary/15 text-primary"
            }`}
          >
            {ready ? "Connected" : accountId ? "Setup unfinished" : "Not connected"}
          </span>
        </div>

        <p className="mb-4 text-sm text-muted">
          {ready
            ? "Fans pay you directly. MadGigz takes its commission at the moment of sale and never holds your money."
            : "Stripe verifies your business and bank details. Until that's done MadGigz can't take money for your shows — free shows and external ticket links still work."}
        </p>

        {/* useSearchParams needs a Suspense boundary to keep the rest of this
            page statically renderable. */}
        <Suspense fallback={null}>
          <PayoutConnect connected={Boolean(accountId)} ready={ready} />
        </Suspense>
      </div>

      {balance && (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl bg-surface p-5">
            <p className="text-xs uppercase tracking-wide text-muted">Available</p>
            <p className="mt-2 font-display text-3xl text-foreground">{euros(toEuros(balance.available))}</p>
            <p className="mt-1 text-xs text-muted">Released by MadGigz after the show</p>
          </div>
          <div className="rounded-2xl bg-surface p-5">
            <p className="text-xs uppercase tracking-wide text-muted">Pending</p>
            <p className="mt-2 font-display text-3xl text-foreground">{euros(toEuros(balance.pending))}</p>
            <p className="mt-1 text-xs text-muted">Card payments still clearing at Stripe</p>
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-surface p-5">
        <h2 className="mb-2 font-heading text-lg text-foreground">How the money moves</h2>
        <ul className="flex flex-col gap-2 text-sm text-muted">
          <li>
            A fan buys a ticket. The money goes straight into your Stripe account, minus MadGigz&apos;s
            commission of{" "}
            <span className="text-foreground">
              {FEE_PERCENT}% (minimum {euros(toEuros(MIN_FEE_CENTS))}) plus {VAT_PERCENT}% IVA
            </span>
            .
          </li>
          <li>
            Your balance is held on a manual schedule and released after the show has happened, so
            refunds always have something to reverse against.
          </li>
          <li>
            Refunds, including a cancelled show, reverse the transfer and the commission
            automatically.
          </li>
        </ul>
      </div>

      {/* Vir, 20 Sept 2026: "payouts" from a promoter's side means splitting the
          takings with the acts, not being paid by MadGigz — MadGigz never holds
          their money in the first place. That feature isn't built, so say so
          plainly rather than leaving a gap where a promoter assumes we handle
          it and doesn't pay their artists. */}
      <div className="rounded-2xl border border-muted/20 p-5">
        <h2 className="mb-2 font-heading text-lg text-foreground">
          Splitting with your {account.type === "venue" ? "artists" : "artists and venues"}
        </h2>
        <p className="text-sm text-muted">
          MadGigz doesn&apos;t split takings yet. Everything for your shows lands in your account,
          and whatever you owe the acts you settle with them directly, on whatever terms you agreed.
        </p>
        <p className="mt-2 text-sm text-muted">
          Splitting at the point of sale is coming — if you want it, tell us how you actually pay
          your acts (flat fee, door split, guarantee against percentage) so it gets built to match.{" "}
          <Link href="/pro/events" className="text-accent">
            Your shows
          </Link>{" "}
          already show the takings per night in the meantime.
        </p>
      </div>
    </div>
  );
}
