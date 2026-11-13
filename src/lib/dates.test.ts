import { describe, expect, it } from "vitest";
import { movesDateIntoPast, todayInMadrid } from "./dates";

describe("todayInMadrid", () => {
  it("uses the Madrid calendar day, not UTC", () => {
    // 23:30 UTC on 31 Dec is already 1 Jan in Madrid (UTC+1 in winter).
    expect(todayInMadrid(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    expect(todayInMadrid(new Date("2026-07-10T12:00:00Z"))).toBe("2026-07-10");
  });
});

describe("movesDateIntoPast", () => {
  const now = new Date("2026-11-13T12:00:00Z");

  it("blocks moving a show to a past date", () => {
    expect(movesDateIntoPast("2026-12-01", "2026-11-05", now)).toBe(true);
  });

  it("allows today, the future, and re-saving an unchanged past date", () => {
    expect(movesDateIntoPast("2026-12-01", "2026-11-13", now)).toBe(false);
    expect(movesDateIntoPast("2026-12-01", "2027-01-15", now)).toBe(false);
    expect(movesDateIntoPast("2026-10-01", "2026-10-01", now)).toBe(false);
  });
});
