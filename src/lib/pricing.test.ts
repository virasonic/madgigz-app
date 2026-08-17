import { describe, it, expect } from "vitest";
import { toCents, toEuros, breakdownFor, formatEuros } from "./pricing";

// The money math is the highest-stakes logic in the app: a subtle bug here
// silently over- or under-charges a fan or short-pays an artist. These tests
// pin the defaults (5% fee, 21% VAT, €0.25 floor — no env overrides in test) and
// guard the euros⇄cents boundary that has caused real bugs (a €14 gig rendered
// as €0.14, a €2 ticket charged as 2 cents).

describe("toCents / toEuros", () => {
  it("converts euros to integer cents", () => {
    expect(toCents(2)).toBe(200);
    expect(toCents(14.99)).toBe(1499);
    expect(toCents(0.1)).toBe(10); // guards the classic float 0.1*100 = 10.000...2
  });

  it("round-trips back to euros", () => {
    expect(toEuros(939)).toBe(9.39);
    expect(toEuros(1499)).toBe(14.99);
    expect(toEuros(toCents(19.99))).toBe(19.99);
  });
});

describe("breakdownFor", () => {
  it("splits a normal ticket: fan pays the set price, artist absorbs fee + VAT", () => {
    // €10.00 → fee 5% = 50c, VAT 21% of 50c = 11c (10.5 rounds up), fee = 61c.
    const b = breakdownFor(1000);
    expect(b.fanPaysCents).toBe(1000);
    expect(b.feeBaseCents).toBe(50);
    expect(b.feeVatCents).toBe(11);
    expect(b.feeCents).toBe(61);
    expect(b.artistReceivesCents).toBe(939);
  });

  it("keeps the invariant: fan pays == artist receives + total fee", () => {
    for (const total of [1000, 2000, 550, 12345]) {
      const b = breakdownFor(total);
      expect(b.artistReceivesCents + b.feeCents).toBe(b.fanPaysCents);
    }
  });

  it("applies the €0.25 floor on cheap tickets instead of the raw percentage", () => {
    // €1.00 → 5% = 5c, but the floor lifts it to 25c; VAT 21% of 25c = 5c.
    const b = breakdownFor(100);
    expect(b.feeBaseCents).toBe(25);
    expect(b.feeVatCents).toBe(5);
    expect(b.feeCents).toBe(30);
    expect(b.artistReceivesCents).toBe(70);
  });

  it("never hands the artist a negative payout when the fee floor exceeds the ticket", () => {
    // €0.20 ticket, fee floor + VAT = 30c > 20c → artist gets 0, not -10c.
    const b = breakdownFor(20);
    expect(b.fanPaysCents).toBe(20);
    expect(b.feeCents).toBe(30);
    expect(b.artistReceivesCents).toBe(0);
  });

  it("returns all zeros for a free ticket", () => {
    expect(breakdownFor(0)).toEqual({
      fanPaysCents: 0,
      feeBaseCents: 0,
      feeVatCents: 0,
      feeCents: 0,
      artistReceivesCents: 0,
    });
  });

  it("treats a negative total as zero rather than computing a fee on it", () => {
    expect(breakdownFor(-500).feeCents).toBe(0);
    expect(breakdownFor(-500).artistReceivesCents).toBe(0);
  });
});

describe("formatEuros", () => {
  it("formats cents as a euro string with two decimals", () => {
    expect(formatEuros(939)).toBe("€9.39");
    expect(formatEuros(0)).toBe("€0.00");
    expect(formatEuros(200000)).toBe("€2000.00");
  });

  it("treats its argument as CENTS, not euros (the bug guard)", () => {
    // 14 cents is €0.14 — not €14. This is the exact confusion that shipped once.
    expect(formatEuros(14)).toBe("€0.14");
  });
});
