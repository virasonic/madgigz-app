import { describe, expect, it } from "vitest";
import { validateTiers, type TierInput } from "./tiers-apply";

// The rules a ticket type must satisfy, pinned because the CREATE form now runs
// this same function client-side: if the two ever disagreed, the form would wave
// through a tier the server then refuses - which is exactly the failure this was
// extracted to fix (the show got created, the types silently didn't).

function tier(over: Partial<TierInput> = {}): TierInput {
  return { name: "General", price: 10, capacity: 50, availableUntil: null, sortOrder: 0, ...over };
}

describe("validateTiers", () => {
  it("accepts a well-formed list", () => {
    expect(validateTiers([tier(), tier({ name: "VIP", price: 20, sortOrder: 1 })])).toBeNull();
  });

  it("accepts no tiers at all - a single-price show", () => {
    expect(validateTiers([])).toBeNull();
  });

  // The one that bit us: Number("") is 0, so a row with a name and a price but a
  // blank "Available" reaches the server looking like a zero-capacity tier.
  it("rejects a blank availability", () => {
    expect(validateTiers([tier({ capacity: 0 })])).toMatch(/availability of at least 1/);
  });

  it("rejects a fractional availability", () => {
    expect(validateTiers([tier({ capacity: 2.5 })])).toMatch(/availability of at least 1/);
  });

  it("rejects an unnamed type", () => {
    expect(validateTiers([tier({ name: "   " })])).toMatch(/needs a name/);
  });

  it("rejects a negative or non-numeric price", () => {
    expect(validateTiers([tier({ price: -1 })])).toMatch(/invalid price/);
    expect(validateTiers([tier({ price: Number.NaN })])).toMatch(/invalid price/);
  });

  // Free tiers are legitimate - a guest list is a zero-price type, not an error.
  it("accepts a free type", () => {
    expect(validateTiers([tier({ price: 0 })])).toBeNull();
  });

  it("defaults max-per-order when omitted, and rejects a bad one", () => {
    expect(validateTiers([tier({ maxPerOrder: undefined })])).toBeNull();
    expect(validateTiers([tier({ maxPerOrder: 0 })])).toMatch(/max-per-order of at least 1/);
  });

  it("names the offending type, so a long list is fixable", () => {
    expect(validateTiers([tier(), tier({ name: "Early Bird", capacity: 0 })])).toContain("Early Bird");
  });
});
