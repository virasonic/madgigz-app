import type { TierInput } from "@/lib/tiers-apply";
import { parseEuros } from "@/lib/pricing";

// The form-string ⇄ TierInput conversion for price tiers (#151), kept apart from
// the editors that use it. Every surface that edits ticket types - the artist's
// phone sheet, /admin and /pro - goes through these, because turning form
// strings into a TierInput is the error-prone part and two copies of it is how a
// price ends up off by a decimal comma on one surface only. Being plain data
// conversion with no React in it, it is also the part worth unit-testing.

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

/**
 * An `<input type="datetime-local">` holds a LOCAL wall-clock string with no
 * zone in it. This used to be built with `toISOString().slice(0, 16)`, which put
 * a UTC clock in the box - and tierRowsToInput then read it back as local. So
 * every open-and-save of an existing tier walked its cutoff earlier by the
 * Madrid offset: 2h in summer, 1h in winter (#206). Building the string from
 * local parts makes the round-trip lossless, which is what the test pins.
 */
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
    availableUntil: t.availableUntil ? toLocalInputValue(t.availableUntil) : "",
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
