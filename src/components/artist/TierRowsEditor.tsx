"use client";

import {
  breakdownFor,
  FEE_PERCENT,
  formatEuros,
  MIN_FEE_CENTS,
  parseEuros,
  toCents,
} from "@/lib/pricing";
import type { TierInput } from "@/lib/tiers-apply";
import InfoTip from "@/components/ui/InfoTip";
import { useT } from "@/lib/i18n/LocaleProvider";

// Controlled price-tier row editor (#151). Presentational only — it owns no
// server calls, just the list of rows. Used both when CREATING a show (add-show,
// tiers submitted with the show) and when managing one (ArtistTierEditor wraps
// this with a Save button). Laid out to fit a phone: no horizontal overflow, and
// a compact one-line "you keep" rather than a full fee table per row.

export interface TierRow {
  id?: string;
  name: string;
  price: string;
  capacity: string; // how many of this type are available
  maxPerOrder: string;
  availableUntil: string; // datetime-local value ("" = no cutoff)
  sold: number;
}

export function emptyTierRow(): TierRow {
  return { name: "", price: "", capacity: "", maxPerOrder: "6", availableUntil: "", sold: 0 };
}

// A row the user actually started filling in — a wholly blank row is ignored
// (not a real ticket type), so a stray empty row never blocks the form.
export function tierRowIsBlank(r: TierRow): boolean {
  return !r.name.trim() && !r.price.trim() && !r.capacity.trim();
}

export function tierToRow(t: {
  id: string;
  name: string;
  price: number;
  capacity: number;
  maxPerOrder: number;
  availableUntil: string | null;
  sold: number;
}): TierRow {
  return {
    id: t.id,
    name: t.name,
    price: String(t.price),
    capacity: String(t.capacity),
    maxPerOrder: String(t.maxPerOrder),
    availableUntil: t.availableUntil ? new Date(t.availableUntil).toISOString().slice(0, 16) : "",
    sold: t.sold,
  };
}

export function tierRowsToInput(rows: TierRow[]): TierInput[] {
  return rows
    .filter((r) => !tierRowIsBlank(r))
    .map((r, idx) => ({
      id: r.id,
      name: r.name,
      price: parseEuros(r.price),
      capacity: Number(r.capacity),
      maxPerOrder: r.maxPerOrder ? Number(r.maxPerOrder) : undefined,
      availableUntil: r.availableUntil ? new Date(r.availableUntil).toISOString() : null,
      sortOrder: idx,
    }));
}

const numberField =
  "w-full min-w-0 rounded-lg border border-muted/20 bg-background px-2 py-2 text-sm text-foreground";

export default function TierRowsEditor({
  rows,
  onChange,
}: {
  rows: TierRow[];
  onChange: (rows: TierRow[]) => void;
}) {
  const { t } = useT();

  function update(i: number, patch: Partial<TierRow>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    onChange([...rows, emptyTierRow()]);
  }
  function removeRow(i: number) {
    onChange(rows.filter((_, idx) => idx !== i));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-heading text-sm text-muted">{t("tierEditor.title")}</span>
        <span className="text-xs text-muted">
          {rows.length === 0 ? t("tierEditor.single") : t("tierEditor.count", { n: rows.length })}
        </span>
      </div>
      <p className="text-xs text-muted">{t("tierEditor.subtitle")}</p>

      {rows.map((r, i) => {
        const priceNum = parseEuros(r.price);
        const bd =
          r.price.trim() && !Number.isNaN(priceNum) && priceNum > 0
            ? breakdownFor(toCents(priceNum))
            : null;
        const net = bd ? formatEuros(bd.artistReceivesCents) : null;
        return (
          <div key={r.id ?? `new-${i}`} className="flex flex-col gap-2 rounded-2xl border border-muted/20 p-3">
            <input
              value={r.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder={t("tierEditor.namePlaceholder")}
              className="w-full min-w-0 rounded-lg border border-muted/20 bg-background px-3 py-2 text-sm text-foreground"
            />
            {/* Grid columns are exactly 1fr each — they can't overflow the row
                the way three w-1/3 + gaps did. */}
            <div className="grid grid-cols-3 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-muted">{t("tierEditor.price")}</span>
                <input
                  value={r.price}
                  onChange={(e) => update(i, { price: e.target.value })}
                  inputMode="decimal"
                  placeholder="0"
                  className={numberField}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-muted">{t("tierEditor.available")}</span>
                <input
                  value={r.capacity}
                  onChange={(e) => update(i, { capacity: e.target.value })}
                  inputMode="numeric"
                  placeholder="0"
                  className={numberField}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wide text-muted">{t("tierEditor.maxPerOrder")}</span>
                <input
                  value={r.maxPerOrder}
                  onChange={(e) => update(i, { maxPerOrder: e.target.value })}
                  inputMode="numeric"
                  placeholder="6"
                  className={numberField}
                />
              </label>
            </div>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wide text-muted">{t("tierEditor.onSaleUntil")}</span>
              <input
                type="datetime-local"
                value={r.availableUntil}
                onChange={(e) => update(i, { availableUntil: e.target.value })}
                className="w-full min-w-0 max-w-full rounded-lg border border-muted/20 bg-background px-2 py-2 text-sm text-foreground"
              />
            </label>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-muted">
                {net ? t("tierEditor.youKeep", { amount: net }) : t("tierEditor.freeType")}
                {bd && (
                  <InfoTip
                    text={t("tierEditor.breakdownTip", {
                      fans: formatEuros(bd.fanPaysCents),
                      fee: formatEuros(bd.feeBaseCents),
                      vat: formatEuros(bd.feeVatCents),
                      net: net ?? "",
                      pct: FEE_PERCENT,
                      min: formatEuros(MIN_FEE_CENTS),
                    })}
                  />
                )}
                {r.sold > 0 && ` · ${t("tierEditor.sold", { n: r.sold })}`}
              </span>
              <button
                type="button"
                onClick={() => removeRow(i)}
                disabled={r.sold > 0}
                className="font-heading text-danger disabled:opacity-40"
              >
                {t("tierEditor.remove")}
              </button>
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addRow}
        className="self-start rounded-full border border-muted/30 px-4 py-2 text-sm font-heading text-foreground"
      >
        {t("tierEditor.addTier")}
      </button>
    </div>
  );
}
