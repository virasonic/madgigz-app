"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  openProPayoutDashboard,
  refreshProPayoutStatus,
  startProPayoutOnboarding,
} from "./payout-actions";
import { useT } from "@/lib/i18n/LocaleProvider";

export default function PayoutConnect({
  connected,
  ready,
}: {
  connected: boolean;
  ready: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Coming back from Stripe's hosted onboarding. Stripe doesn't tell us the
  // outcome in the return URL - it only says the flow was left - so the truth
  // comes from asking Stripe for the account's current capabilities. The
  // account.updated webhook does this too, but it can land after the redirect,
  // and an organiser staring at "not connected" a second after finishing is
  // the moment that costs the support email.
  const returned = params.get("stripe") === "return";
  useEffect(() => {
    if (!returned) return;
    let cancelled = false;
    refreshProPayoutStatus().then(() => {
      if (!cancelled) router.replace("/pro/payouts");
    });
    return () => {
      cancelled = true;
    };
  }, [returned, router]);

  function connect() {
    setError(null);
    startTransition(async () => {
      const { url, error: connectError } = await startProPayoutOnboarding();
      if (url) {
        window.location.href = url;
        return;
      }
      setError(connectError ?? t("pro.stripeOpenError"));
    });
  }

  function openDashboard() {
    setError(null);
    startTransition(async () => {
      const { url, error: dashError } = await openProPayoutDashboard();
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
      setError(dashError ?? t("pro.stripeDashboardError"));
    });
  }

  function refresh() {
    setError(null);
    startTransition(async () => {
      const { error: refreshError } = await refreshProPayoutStatus();
      if (refreshError) setError(refreshError);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {!ready && (
          <button
            type="button"
            onClick={connect}
            disabled={isPending}
            className="rounded-full bg-primary px-5 py-2.5 font-heading text-sm text-foreground disabled:opacity-60"
          >
            {isPending
              ? t("pro.openingStripe")
              : t(connected ? "pro.connectFinishCta" : "pro.connectCta")}
          </button>
        )}

        {connected && (
          <button
            type="button"
            onClick={openDashboard}
            disabled={isPending}
            className="rounded-full bg-surface px-5 py-2.5 font-heading text-sm text-foreground ring-1 ring-muted/30 disabled:opacity-60"
          >
            {t("pro.openStripe")}
          </button>
        )}

        {connected && !ready && (
          <button
            type="button"
            onClick={refresh}
            disabled={isPending}
            className="rounded-full px-5 py-2.5 font-heading text-sm text-muted hover:text-foreground disabled:opacity-60"
          >
            {t("pro.checkAgain")}
          </button>
        )}
      </div>
    </div>
  );
}
