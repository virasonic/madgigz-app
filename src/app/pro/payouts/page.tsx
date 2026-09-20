import Link from "next/link";
import { Suspense } from "react";
import { stripe } from "@/lib/stripe";
import { FEE_PERCENT, MIN_FEE_CENTS, VAT_PERCENT, toEuros } from "@/lib/pricing";
import { proClient, requirePro } from "@/lib/supabase/pro-queries";
import { fetchOrganiserSettlement, PAYOUT_HOLD_DAYS } from "@/lib/payouts";
import { formatEuros } from "@/lib/pricing";
import { dateLocale } from "@/lib/dates";
import PayoutConnect from "./PayoutConnect";
import FiscalIdentityCard from "@/components/artist/FiscalIdentityCard";
import { hasFiscalIdentity } from "@/lib/fiscal-server";

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
  const { userId, account, locale, t } = await requirePro();

  const { data: profile } = await proClient()
    .from("profiles")
    .select("stripe_account_id, stripe_payouts_ready")
    .eq("id", userId)
    .maybeSingle();

  const accountId = (profile?.stripe_account_id as string | null) ?? null;
  const ready = Boolean(profile?.stripe_payouts_ready);
  const [balance, settlement, fiscalProvided] = await Promise.all([
    ready ? fetchBalance(accountId) : Promise.resolve(null),
    fetchOrganiserSettlement(proClient(), userId, accountId),
    // #97: the lawyer requires tax details on file before any payout, and
    // /admin/payouts refuses to release without them. A promoter had no way to
    // enter theirs at all, so they could sell a show and then not be payable.
    hasFiscalIdentity(userId),
  ]);

  const showDate = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(dateLocale(locale), {
      day: "numeric",
      month: "short",
    });

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

      {/* Sits directly under the Stripe card because the two together are what
          make an organiser payable - a connected account with no tax details on
          file still cannot be released. Warned loudly rather than quietly
          missing, since the consequence only shows up at the moment they expect
          to be paid. */}
      <div
        className={`rounded-2xl p-5 ${
          fiscalProvided ? "bg-surface" : "border border-primary/30 bg-primary/10"
        }`}
      >
        <h2 className="mb-1 font-heading text-lg text-foreground">{t("pro.taxTitle")}</h2>
        {!fiscalProvided && <p className="mb-3 text-sm text-muted">{t("pro.taxBlocking")}</p>}
        <FiscalIdentityCard provided={fiscalProvided} />
      </div>

      {/* Vir, 20 Sept 2026: say plainly that the money comes AFTER the show, and
          that one settled night can be paid while another is still selling -
          which is the question a promoter running two shows at once will ask. */}
      <div className="rounded-2xl border border-accent/30 bg-accent/5 p-5">
        <h2 className="font-heading text-sm text-foreground">{t("pro.afterShowBanner")}</h2>
        <p className="mt-1 text-sm text-muted">
          {t("pro.afterShowBody", { days: PAYOUT_HOLD_DAYS })}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-surface p-5">
          <p className="text-xs uppercase tracking-wide text-muted">{t("pro.dueTitle")}</p>
          <p className="mt-2 font-display text-3xl text-accent">
            {formatEuros(settlement.releasableCents)}
          </p>
          <p className="mt-1 text-xs text-muted">{t("pro.dueHint")}</p>
        </div>
        <div className="rounded-2xl bg-surface p-5">
          <p className="text-xs uppercase tracking-wide text-muted">{t("pro.heldTitle")}</p>
          <p className="mt-2 font-display text-3xl text-foreground">
            {formatEuros(settlement.heldCents)}
          </p>
          <p className="mt-1 text-xs text-muted">
            {t("pro.heldHint", { days: PAYOUT_HOLD_DAYS })}
          </p>
        </div>
      </div>

      {/* The per-show ledger is what makes the two numbers above checkable
          rather than something they have to take on trust. */}
      <div className="rounded-2xl bg-surface p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-heading text-lg text-foreground">{t("pro.perShow")}</h2>
          <span className="text-xs text-muted">
            {t("pro.paidOut")}: {formatEuros(settlement.paidOutCents)}
          </span>
        </div>
        {settlement.shows.length === 0 ? (
          <p className="text-sm text-muted">{t("pro.noEarnings")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {settlement.shows.map((show) => (
              <div key={show.eventId} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="min-w-0 flex-1 truncate text-foreground">{show.title}</span>
                <span className="text-muted">{showDate(show.eventDate)}</span>
                <span className="w-20 text-right tabular-nums text-foreground">
                  {formatEuros(show.netCents)}
                </span>
                <span className="w-40 text-right text-xs">
                  {show.due ? (
                    <span className="text-accent">{t("pro.showDue")}</span>
                  ) : (
                    <span className="text-muted">
                      {t("pro.showHeld", { date: showDate(show.dueDate) })}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
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
          <li>{t("pro.moneyStep2", { days: PAYOUT_HOLD_DAYS })}</li>
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
