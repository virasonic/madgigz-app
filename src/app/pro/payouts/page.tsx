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
  const { userId, account, t } = await requirePro();

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
        <h1 className="font-display text-2xl text-foreground">{t("pro.navPayouts")}</h1>
        <p className="text-sm text-muted">
          {t("pro.payoutsSubtitle")}
        </p>
      </div>

      <div className="rounded-2xl bg-surface p-5">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-heading text-lg text-foreground">{t("pro.yourStripe")}</h2>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-heading ${
              ready ? "bg-accent/15 text-accent" : "bg-primary/15 text-primary"
            }`}
          >
            {t(
              ready
                ? "pro.stripeConnected"
                : accountId
                  ? "pro.stripeUnfinished"
                  : "pro.stripeNotConnected"
            )}
          </span>
        </div>

        <p className="mb-4 text-sm text-muted">
          {t(ready ? "pro.stripeReadyBody" : "pro.stripeNotReadyBody")}
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
            <p className="text-xs uppercase tracking-wide text-muted">{t("pro.available")}</p>
            <p className="mt-2 font-display text-3xl text-foreground">{euros(toEuros(balance.available))}</p>
            <p className="mt-1 text-xs text-muted">{t("pro.availableHint")}</p>
          </div>
          <div className="rounded-2xl bg-surface p-5">
            <p className="text-xs uppercase tracking-wide text-muted">{t("pro.pending")}</p>
            <p className="mt-2 font-display text-3xl text-foreground">{euros(toEuros(balance.pending))}</p>
            <p className="mt-1 text-xs text-muted">{t("pro.pendingHint")}</p>
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-surface p-5">
        <h2 className="mb-2 font-heading text-lg text-foreground">{t("pro.howMoneyMoves")}</h2>
        <ul className="flex flex-col gap-2 text-sm text-muted">
          <li>
            {t("pro.moneyStep1")}{" "}
            <span className="text-foreground">
              {t("pro.moneyStep1Rate", {
                pct: FEE_PERCENT,
                min: euros(toEuros(MIN_FEE_CENTS)),
                vat: VAT_PERCENT,
              })}
            </span>
            .
          </li>
          <li>{t("pro.moneyStep2")}</li>
          <li>{t("pro.moneyStep3")}</li>
        </ul>
      </div>

      {/* Vir, 20 Sept 2026: "payouts" from a promoter's side means splitting the
          takings with the acts, not being paid by MadGigz — MadGigz never holds
          their money in the first place. That feature isn't built, so say so
          plainly rather than leaving a gap where a promoter assumes we handle
          it and doesn't pay their artists. */}
      <div className="rounded-2xl border border-muted/20 p-5">
        <h2 className="mb-2 font-heading text-lg text-foreground">
          {t(account.type === "venue" ? "pro.splitTitleVenue" : "pro.splitTitlePromoter")}
        </h2>
        <p className="text-sm text-muted">
          {t("pro.splitBody")}
        </p>
        <p className="mt-2 text-sm text-muted">
          {t("pro.splitComing")}{" "}
          <Link href="/pro/events" className="text-accent">
            {t("pro.yourShows")}
          </Link>{" "}
          {t("pro.splitMeanwhile")}
        </p>
      </div>
    </div>
  );
}
