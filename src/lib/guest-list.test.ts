import { describe, expect, it } from "vitest";
import { filterGuests, sortGuests, type GuestEntry } from "./guest-list";

const g = (ticketId: string, username: string, seat: number | null = null): GuestEntry => ({
  ticketId,
  username,
  quantity: 1,
  seat,
  tierName: null,
  checkedInAt: null,
});

const guests = [g("t3", "zoe_k", 2), g("t1", "Marta", 1), g("t2", "zoe_k", 1), g("t4", "ana.b")];

describe("filterGuests", () => {
  it("returns everyone for a blank query", () => {
    expect(filterGuests(guests, "")).toHaveLength(4);
    expect(filterGuests(guests, "   ")).toHaveLength(4);
  });

  it("matches case-insensitively on a substring", () => {
    expect(filterGuests(guests, "ZOE").map((x) => x.ticketId)).toEqual(["t3", "t2"]);
    expect(filterGuests(guests, "art")).toEqual([guests[1]]);
  });

  it("ignores a leading @ and surrounding spaces, as the door would type it", () => {
    expect(filterGuests(guests, " @ana ")).toEqual([guests[3]]);
  });

  it("finds nobody rather than everybody on a miss", () => {
    expect(filterGuests(guests, "nobody")).toEqual([]);
  });
});

describe("sortGuests", () => {
  it("orders by username (case-insensitive) then seat, and keeps the input intact", () => {
    const out = sortGuests(guests);
    expect(out.map((x) => x.ticketId)).toEqual(["t4", "t1", "t2", "t3"]);
    expect(guests[0].ticketId).toBe("t3");
  });
});
