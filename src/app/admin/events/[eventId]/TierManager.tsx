"use client";

import { useState } from "react";
import { setEventTiers, type TierInput } from "../tier-actions";

// Admin-only price-tier editor (#151), English like the rest of /admin. Add,
// edit, reorder-by-list, and remove tiers; Save writes them and recomputes the
// event's capacity/price. A tier that has already sold tickets can't be removed
// or shrunk below its sales (the action enforces this too).

interface Row {
  id?: string;
  name: string;
  price: string;
  capacity: string;
  availableUntil: string; // datetime-local value ("" = no cutoff)
  sold: number;
}

export interface TierManagerTier {
  id: string;
  name: string;
  price: number;
  capacity: number;
  availableUntil: string | null;
  sold: number;
}

function toRow(t: TierManagerTier): Row {
  return {
    id: t.id,
    name: t.name,
    price: String(t.price),
    capacity: String(t.capacity),
    // ISO → the "YYYY-MM-DDTHH:mm" a datetime-local input wants (local time).
    availableUntil: t.availableUntil
      ? new Date(t.availableUntil).toISOString().slice(0, 16)
      : "",
    sold: t.sold,
  };
}

export default function TierManager({
  eventId,
  initialTiers,
}: {
  eventId: string;
  initialTiers: TierManagerTier[];
}) {
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
    const result = await setEventTiers(eventId, payload);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSaved(true);
  }

  return (
    <div className="rounded-2xl bg-surface p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg text-foreground">Price tiers</h2>
        <span className="text-xs text-muted">{rows.length === 0 ? "Single price" : `${rows.length} tiers`}</span>
      </div>
      <p className="mt-1 text-xs text-muted">
        Leave empty for a single-price show. With tiers, the event capacity and the &ldquo;from&rdquo;
        price are set from the tiers below.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        {rows.map((r, i) => (
          <div key={r.id ?? `new-${i}`} className="rounded-xl border border-muted/20 p-3">
            <div className="flex flex-wrap gap-2">
              <input
                value={r.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="Name (e.g. General, VIP)"
                className="min-w-[8rem] flex-1 rounded-lg border border-muted/20 bg-background px-3 py-2 text-sm text-foreground"
              />
              <input
                value={r.price}
                onChange={(e) => update(i, { price: e.target.value })}
                placeholder="Price €"
                inputMode="decimal"
                className="w-24 rounded-lg border border-muted/20 bg-background px-3 py-2 text-sm text-foreground"
              />
              <input
                value={r.capacity}
                onChange={(e) => update(i, { capacity: e.target.value })}
                placeholder="Capacity"
                inputMode="numeric"
                className="w-24 rounded-lg border border-muted/20 bg-background px-3 py-2 text-sm text-foreground"
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="text-xs text-muted">On sale until (optional)</label>
              <input
                type="datetime-local"
                value={r.availableUntil}
                onChange={(e) => update(i, { availableUntil: e.target.value })}
                className="rounded-lg border border-muted/20 bg-background px-3 py-2 text-sm text-foreground"
              />
              <span className="text-xs text-muted">Sold: {r.sold}</span>
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="ml-auto text-xs text-danger disabled:opacity-40"
                disabled={r.sold > 0}
                title={r.sold > 0 ? "Can't remove a tier that has sold tickets" : undefined}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={addRow}
          className="rounded-full border border-muted/30 px-4 py-2 text-sm text-foreground"
        >
          + Add tier
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-full bg-primary px-5 py-2 text-sm font-heading text-foreground disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save tiers"}
        </button>
        {saved && <span className="text-xs text-accent">Saved</span>}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
