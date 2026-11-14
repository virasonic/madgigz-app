import { describe, expect, it } from "vitest";
import { planRefundReconciliation, type ReconcileTicket } from "./refund-reconcile";

function seat(n: number, over: Partial<ReconcileTicket> = {}): ReconcileTicket {
  return { id: `t${n}`, priceCents: 1000, refunded: false, checkedIn: false, seat: n, ...over };
}

describe("planRefundReconciliation", () => {
  it("marks the ticket a tagged refund names, whatever the amount", () => {
    // A voluntary refund sends back less than the price, so amount can't be the key.
    const plan = planRefundReconciliation({
      tickets: [seat(1), seat(2)],
      refunds: [{ amountCents: 942, ticketId: "t1" }],
      fullyRefunded: false,
    });
    expect(plan).toEqual({ markRefunded: ["t1"], inferred: [], unmatchedCents: 0 });
  });

  it("does nothing when the app already marked the tagged ticket", () => {
    const plan = planRefundReconciliation({
      tickets: [seat(1, { refunded: true }), seat(2)],
      refunds: [{ amountCents: 1000, ticketId: "t1" }],
      fullyRefunded: false,
    });
    expect(plan).toEqual({ markRefunded: [], inferred: [], unmatchedCents: 0 });
  });

  it("marks every ticket when the whole payment was refunded", () => {
    const plan = planRefundReconciliation({
      tickets: [seat(1), seat(2, { checkedIn: true }), seat(3, { refunded: true })],
      refunds: [{ amountCents: 3000, ticketId: null }],
      fullyRefunded: true,
    });
    expect(plan.markRefunded.sort()).toEqual(["t1", "t2"]);
    expect(plan.inferred.sort()).toEqual(["t1", "t2"]);
    expect(plan.unmatchedCents).toBe(0);
  });

  it("treats an untagged refund as covered by a ticket the old app already marked", () => {
    const plan = planRefundReconciliation({
      tickets: [seat(1, { refunded: true }), seat(2)],
      refunds: [{ amountCents: 1000, ticketId: null }],
      fullyRefunded: false,
    });
    expect(plan).toEqual({ markRefunded: [], inferred: [], unmatchedCents: 0 });
  });

  it("infers one seat from a dashboard refund of exactly one seat's price", () => {
    const plan = planRefundReconciliation({
      tickets: [seat(1), seat(2), seat(3)],
      refunds: [{ amountCents: 1000, ticketId: null }],
      fullyRefunded: false,
    });
    // Highest unused seat.
    expect(plan).toEqual({ markRefunded: ["t3"], inferred: ["t3"], unmatchedCents: 0 });
  });

  it("prefers a seat that hasn't been scanned in", () => {
    const plan = planRefundReconciliation({
      tickets: [seat(1), seat(2, { checkedIn: true }), seat(3, { checkedIn: true })],
      refunds: [{ amountCents: 1000, ticketId: null }],
      fullyRefunded: false,
    });
    expect(plan.markRefunded).toEqual(["t1"]);
  });

  it("infers two seats from two seats' worth", () => {
    const plan = planRefundReconciliation({
      tickets: [seat(1), seat(2), seat(3)],
      refunds: [
        { amountCents: 1000, ticketId: null },
        { amountCents: 1000, ticketId: null },
      ],
      fullyRefunded: false,
    });
    expect(plan.markRefunded).toEqual(["t3", "t2"]);
    expect(plan.unmatchedCents).toBe(0);
  });

  it("refuses to guess when the amount fits no whole seat", () => {
    const plan = planRefundReconciliation({
      tickets: [seat(1), seat(2)],
      refunds: [{ amountCents: 700, ticketId: null }],
      fullyRefunded: false,
    });
    expect(plan).toEqual({ markRefunded: [], inferred: [], unmatchedCents: 700 });
  });

  it("refuses to guess when the amount is a seat and a bit", () => {
    const plan = planRefundReconciliation({
      tickets: [seat(1), seat(2)],
      refunds: [{ amountCents: 1300, ticketId: null }],
      fullyRefunded: false,
    });
    expect(plan.markRefunded).toEqual([]);
    expect(plan.unmatchedCents).toBe(1300);
  });

  it("keeps a tagged refund apart from an untagged one on the same order", () => {
    const plan = planRefundReconciliation({
      tickets: [seat(1), seat(2), seat(3)],
      refunds: [
        { amountCents: 942, ticketId: "t1" },
        { amountCents: 1000, ticketId: null },
      ],
      fullyRefunded: false,
    });
    expect(plan.markRefunded).toEqual(["t1", "t3"]);
    expect(plan.inferred).toEqual(["t3"]);
  });

  it("ignores a tag that points at a ticket from another payment", () => {
    const plan = planRefundReconciliation({
      tickets: [seat(1), seat(2)],
      refunds: [{ amountCents: 1000, ticketId: "someone-else" }],
      fullyRefunded: false,
    });
    // Falls back to the amount, which fits one seat.
    expect(plan.markRefunded).toEqual(["t2"]);
  });

  it("never infers a free ticket", () => {
    const plan = planRefundReconciliation({
      tickets: [seat(1, { priceCents: 0 }), seat(2, { priceCents: 0 })],
      refunds: [{ amountCents: 500, ticketId: null }],
      fullyRefunded: false,
    });
    expect(plan).toEqual({ markRefunded: [], inferred: [], unmatchedCents: 500 });
  });
});
