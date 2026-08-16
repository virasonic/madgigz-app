"use client";

import { useState } from "react";
import FeeBreakdown from "@/components/artist/FeeBreakdown";
import { saveArtistTiers } from "@/app/(app)/profile/show-actions";
import type { TierInput } from "@/lib/tiers-apply";
import { useT } from "@/lib/i18n/LocaleProvider";

// The artist's own price-tier editor (#151), localized (unlike the admin one).
// Each tier shows the MadGigz fee breakdown for its price via <FeeBreakdown>, so
// the artist sees what they net per tier before saving. Empty = single-price.

export interface ArtistTier {
  id: string;
  name: string;
  price: number;
  capacity: number;
  availableUntil: string | null;
  sold: number;
}

interface Row {
  id?: string;
  name: string;
  price: string;
  capacity: string;
  availableUntil: string; // datetime-local ("" = no cutoff)
  sold: number;
}

function toRow(t: ArtistTier): Row {
  return {
    id: t.id,
    name: t.name,
    price: String(t.price),
    capacity: String(t.capacity),
    availableUntil: t.availableUntil ? new Date(t.availableUntil).toISOString().slice(0, 16) : "",
    sold: t.sold,
  };
}

export default function ArtistTierEditor({
  eventId,
  initialTiers,
  onSaved,
}: {
  eventId: string;
  initialTiers: ArtistTier[];
  onSaved?: () => void;
}) {
  const { t } = useT();
  const [rows, setRows] = useState<Row[]>(initialTiers.map(toRow));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function update(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
    setSaved(false);
  }
  function addRow() {
    setRows((rs) => [...rs, { name: "", price: "", capacity: "", availableUntil: "", sold: 0 }]);
    setSaved(false);
  }
  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, idx) => idx !== i));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    const payload: TierInput[] = rows.map((r, idx) => ({
      id: r.id,
      name: r.name,
      price: Number(r.price),
      capacity: Number(r.capacity),
      availableUntil: r.availableUntil ? new Date(r.availableUntil).toISOString() : null,
      sortOrder: idx,
    }));
    const result = await saveArtistTiers(eventId, payload);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSaved(true);
    onSaved?.();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-sm text-muted">{t("tierEditor.title")}</h3>
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
              className="w-1/2 rounded-lg border border-muted/20 bg-background px-3 py-2 text-sm text-foreground"
            />
            <input
              value={r.capacity}
              onChange={(e) => update(i, { capacity: e.target.value })}
              placeholder={t("tierEditor.capacity")}
              inputMode="numeric"
              className="w-1/2 rounded-lg border border-muted/20 bg-background px-3 py-2 text-sm text-foreground"
            />
          </div>
          <label className="text-xs text-muted">{t("tierEditor.onSaleUntil")}</label>
          <input
            type="datetime-local"
            value={r.availableUntil}
            onChange={(e) => update(i, { availableUntil: e.target.value })}
            className="w-full rounded-lg border border-muted/20 bg-background px-3 py-2 text-sm text-foreground"
          />
          {/* What the artist nets at this tier's price. */}
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

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={addRow}
          className="rounded-full border border-muted/30 px-4 py-2 text-sm font-heading text-foreground"
        >
          {t("tierEditor.addTier")}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-full bg-primary px-5 py-2 text-sm font-heading text-foreground disabled:opacity-50"
        >
          {saving ? t("tierEditor.saving") : t("tierEditor.save")}
        </button>
        {saved && <span className="text-xs text-accent">{t("tierEditor.saved")}</span>}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
