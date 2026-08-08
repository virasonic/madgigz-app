"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import {
  openPayoutDashboard,
  refreshPayoutStatus,
  startPayoutOnboarding,
} from "@/app/(app)/profile/payout-actions";
import { FEE_PERCENT } from "@/lib/pricing";

export default function PayoutCard({
  connected,
  ready,
}: {
  connected: boolean;
  ready: boolean;
}) {
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [liveReady, setLiveReady] = useState(ready);

  // Coming back from Stripe's hosted onboarding, pull the real capability state
  // rather than assuming success - the artist may have abandoned it partway.
  useEffect(() => {
    if (searchParams.get("payout") !== "return") return;
    startTransition(async () => {
      const result = await refreshPayoutStatus();
      if (result.error) setError(result.error);
      else setLiveReady(result.ready);
    });
  }, [searchParams]);

  function handleConnect() {
    setError(null);
    startTransition(async () => {
      const result = await startPayoutOnboarding();
      if (result.error) setError(result.error);
      else if (result.url) window.location.href = result.url;
    });
  }

  function handleDashboard() {
    setError(null);
    startTransition(async () => {
      const result = await openPayoutDashboard();
      if (result.error) setError(result.error);
      else if (result.url) window.open(result.url, "_blank", "noopener,noreferrer");
    });
  }

  return (
    // bg-background, not bg-surface: this now lives inside the Settings sheet,
    // whose own backdrop is bg-surface - matching the sheet's other rows
    // instead of disappearing into their shared background.
    <div className="rounded-2xl bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-sm text-foreground">Payouts</p>
          <p className="text-xs text-muted">
            {liveReady
              ? `Connected — you keep ${100 - FEE_PERCENT}% of each ticket`
              : connected
                ? "Stripe still needs a few details before you can sell"
                : "Connect a payout account to sell tickets through MadGigz"}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-heading uppercase ${
            liveReady ? "bg-accent/15 text-accent" : "bg-primary/15 text-primary"
          }`}
        >
          {liveReady ? "Ready" : connected ? "Pending" : "Not set up"}
        </span>
      </div>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <button
        onClick={liveReady ? handleDashboard : handleConnect}
        disabled={isPending}
        className="mt-3 w-full rounded-full border border-muted/30 py-2 text-sm font-heading text-foreground disabled:opacity-50"
      >
        {isPending
          ? "Opening Stripe..."
          : liveReady
            ? "View payouts on Stripe"
            : connected
              ? "Finish setup"
              : "Connect payouts"}
      </button>
    </div>
  );
}
