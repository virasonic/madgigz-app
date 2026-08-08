"use client";

import { breakdownFor, FEE_PERCENT, formatEuros, toCents } from "@/lib/pricing";

// Shown to artists wherever they set or review a ticket price, so they always
// know what they actually net before publishing. The artist absorbs the fee:
// the price they type is exactly what fans pay.
export default function FeeBreakdown({ priceEuros }: { priceEuros: number }) {
  if (!Number.isFinite(priceEuros) || priceEuros <= 0) {
    return (
      <p className="text-xs text-muted">
        Free event — no MadGigz fee, fans pay nothing.
      </p>
    );
  }

  const { fanPaysCents, feeCents, artistReceivesCents } = breakdownFor(toCents(priceEuros));

  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-background p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-muted">Fans pay</span>
        <span className="text-foreground">{formatEuros(fanPaysCents)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted">MadGigz fee ({FEE_PERCENT}%)</span>
        <span className="text-muted">−{formatEuros(feeCents)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between border-t border-muted/15 pt-2">
        <span className="font-heading text-foreground">You receive</span>
        <span className="font-heading text-accent">{formatEuros(artistReceivesCents)}</span>
      </div>
      <p className="mt-1 text-[10px] text-muted">per ticket</p>
    </div>
  );
}
