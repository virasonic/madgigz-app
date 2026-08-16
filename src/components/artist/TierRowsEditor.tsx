"use client";

import FeeBreakdown from "@/components/artist/FeeBreakdown";
import type { TierInput } from "@/lib/tiers-apply";
import { useT } from "@/lib/i18n/LocaleProvider";

// Controlled price-tier row editor (#151). Presentational only — it owns no
// server calls, just the list of rows and the per-tier fee breakdown. Used both
// when CREATING a show (add-show, tiers submitted with the show) and when
// managing one (ArtistTierEditor wraps this with a Save button). Keeping the row
// UI in one place means the two entry points can't drift.

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

// ISO → the "YYYY-MM-DDTHH:mm" a datetime-local input wants.
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
  return rows.map((r, idx) => ({
    id: r.id,
    name: r.name,
    price: Number(r.price),
    capacity: Number(r.capacity),
    maxPerOrder: r.maxPerOrder ? Number(r.maxPerOrder) : undefined,
    availableUntil: r.availableUntil ? new Date(r.availableUntil).toISOString() : null,
    sortOrder: idx,
  }));
}

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

      {rows.map((r, i) => (
        <div key={r.id ?? `new-${i}`} className="flex flex-col gap-2 rounded-2xl border border-muted/20 p-3">
          <input
            value={r.name}
            onChange={(e) => update(i, { name: e.target.value })}
            placeholder={t("tierEditor.namePlaceholder")}
            className="w-full rounded-lg border border-muted/20 bg-background px-3 py-2 text-sm text-foreground"
          />
          <div className="flex gap-2">
            <input
              value={r.price}
              onChange={(e) => update(i, { price: e.target.value })}
              placeholder={t("tierEditor.price")}
              inputMode="decimal"
              className="w-1/3 rounded-lg border border-muted/20 bg-background px-3 py-2 text-sm text-foreground"
            />
            <input
              value={r.capacity}
              onChange={(e) => update(i, { capacity: e.target.value })}
              placeholder={t("tierEditor.available")}
              inputMode="numeric"
              className="w-1/3 rounded-lg border border-muted/20 bg-background px-3 py-2 text-sm text-foreground"
            />
            <input
              value={r.maxPerOrder}
              onChange={(e) => update(i, { maxPerOrder: e.target.value })}
              placeholder={t("tierEditor.maxPerOrder")}
              inputMode="numeric"
              className="w-1/3 rounded-lg border border-muted/20 bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>
          <label className="text-xs text-muted">{t("tierEditor.onSaleUntil")}</label>
          <input
            type="datetime-local"
            value={r.availableUntil}
            onChange={(e) => update(i, { availableUntil: e.target.value })}
            className="w-full rounded-lg border border-muted/20 bg-background px-3 py-2 text-sm text-foreground"
          />
          {Number(r.price) > 0 && <FeeBreakdown priceEuros={Number(r.price)} />}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">{t("tierEditor.sold", { n: r.sold })}</span>
            <button
              type="button"
              onClick={() => removeRow(i)}
              disabled={r.sold > 0}
              className="text-xs font-heading text-danger disabled:opacity-40"
            >
              {t("tierEditor.remove")}
            </button>
          </div>
        </div>
      ))}

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
