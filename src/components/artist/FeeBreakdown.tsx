"use client";

import {
  breakdownFor,
  FEE_PERCENT,
  formatEuros,
  MIN_FEE_CENTS,
  toCents,
  VAT_PERCENT,
} from "@/lib/pricing";
import InfoTip from "@/components/ui/InfoTip";
import { useT } from "@/lib/i18n/LocaleProvider";

// Shown to artists wherever they set or review a ticket price, so they always
// know what they actually net before publishing. The artist absorbs the fee:
// the price they type is exactly what fans pay.
export default function FeeBreakdown({ priceEuros }: { priceEuros: number }) {
  const { t } = useT();
  if (!Number.isFinite(priceEuros) || priceEuros <= 0) {
    return (
      <p className="rounded-2xl bg-background p-3 text-xs text-muted">
        {t("pickers.freeEventNote")}
      </p>
    );
  }

  const { fanPaysCents, feeBaseCents, feeVatCents, feeCents, artistReceivesCents } =
    breakdownFor(toCents(priceEuros));

  const atMinimum = feeBaseCents === MIN_FEE_CENTS;

  return (
    <div className="flex flex-col gap-1 rounded-2xl bg-background p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="text-muted">{t("pickers.fansPay")}</span>
        <span className="text-foreground">{formatEuros(fanPaysCents)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-muted">
          {t("pickers.feeLine", {
            pct: FEE_PERCENT,
            minSuffix: atMinimum ? t("pickers.feeMin", { amount: formatEuros(MIN_FEE_CENTS) }) : "",
          })}
          <InfoTip text={t("pickers.feeTip")} />
        </span>
        <span className="text-muted">−{formatEuros(feeBaseCents)}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-muted">{t("pickers.ivaLine", { pct: VAT_PERCENT })}</span>
        <span className="text-muted">−{formatEuros(feeVatCents)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between border-t border-muted/15 pt-2">
        <span className="font-heading text-foreground">{t("pickers.youReceive")}</span>
        <span className="font-heading text-accent">{formatEuros(artistReceivesCents)}</span>
      </div>
      <p className="mt-1 text-[10px] text-muted">
        {t("pickers.perTicketTotal", { amount: formatEuros(feeCents) })}
      </p>
    </div>
  );
}
