import { describe, expect, it } from "vitest";
import { countAdmissions } from "./scan-stats";

describe("countAdmissions", () => {
  it("counts people by ticket quantity, not by ticket row", () => {
    expect(
      countAdmissions([
        { quantity: 2, checked_in_at: "2026-10-31T21:00:00Z", refunded: false },
        { quantity: 3, checked_in_at: null, refunded: false },
      ])
    ).toEqual({ checkedIn: 2, total: 5 });
  });

  it("leaves refunded tickets out of both numbers, even if stamped", () => {
    expect(
      countAdmissions([
        { quantity: 1, checked_in_at: "2026-10-31T21:00:00Z", refunded: true },
        { quantity: 4, checked_in_at: null, refunded: true },
        { quantity: 1, checked_in_at: null, refunded: false },
      ])
    ).toEqual({ checkedIn: 0, total: 1 });
  });

  it("is zero of zero for a show with no sales", () => {
    expect(countAdmissions([])).toEqual({ checkedIn: 0, total: 0 });
  });
});
