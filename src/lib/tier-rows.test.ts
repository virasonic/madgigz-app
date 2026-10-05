import { describe, expect, it } from "vitest";
import { tierRowIsBlank, tierRowsToInput, tierToRow, type TierRow } from "./tier-rows";

function stored(availableUntil: string | null) {
  return {
    id: "t1",
    name: "Early Bird",
    price: 8,
    capacity: 10,
    maxPerOrder: 2,
    availableUntil,
    sold: 0,
  };
}

describe("tierToRow / tierRowsToInput round-trip", () => {
  // #206: the editor used to fill the datetime-local input with a UTC clock and
  // read it back as local, so every open-and-save walked a tier's cutoff earlier
  // by the local offset (2h in Madrid summer, 1h in winter). The invariant is
  // that loading a tier and saving it unchanged must not move it - true in
  // whatever zone the test happens to run in, which is the point.
  it.each([
    "2026-10-23T19:00:00.000Z", // Madrid still on CEST (+2)
    "2026-10-30T20:00:00.000Z", // after DST ends 25 Oct, CET (+1)
    "2026-07-04T22:30:00.000Z", // high summer
    "2026-01-15T08:00:00.000Z", // deep winter
  ])("leaves %s untouched", (iso) => {
    const [out] = tierRowsToInput([tierToRow(stored(iso))]);
    expect(out.availableUntil).toBe(iso);
  });

  it("keeps no-cutoff as no cutoff", () => {
    const row = tierToRow(stored(null));
    expect(row.availableUntil).toBe("");
    expect(tierRowsToInput([row])[0].availableUntil).toBeNull();
  });

  it("carries the rest of the row through unchanged", () => {
    const [out] = tierRowsToInput([tierToRow(stored(null))]);
    expect(out).toMatchObject({ id: "t1", name: "Early Bird", price: 8, capacity: 10, maxPerOrder: 2 });
  });

  // Spanish keyboards give a decimal comma; the parse has to survive it.
  it("reads a comma decimal as a price", () => {
    const row: TierRow = {
      name: "VIP", price: "13,5", capacity: "20", maxPerOrder: "4", availableUntil: "", sold: 0,
    };
    expect(tierRowsToInput([row])[0].price).toBe(13.5);
  });

  it("drops wholly blank rows but keeps a part-filled one", () => {
    const blank: TierRow = { name: "", price: "", capacity: "", maxPerOrder: "6", availableUntil: "", sold: 0 };
    expect(tierRowIsBlank(blank)).toBe(true);
    expect(tierRowsToInput([blank])).toHaveLength(0);
    expect(tierRowsToInput([{ ...blank, name: "General" }])).toHaveLength(1);
  });

  it("numbers the types in the order they appear", () => {
    const row = (name: string): TierRow => ({
      name, price: "5", capacity: "5", maxPerOrder: "6", availableUntil: "", sold: 0,
    });
    expect(tierRowsToInput([row("A"), row("B")]).map((t) => t.sortOrder)).toEqual([0, 1]);
  });
});
