import { describe, expect, it } from "vitest";
import { checkPublishAt, formatPublishAt, isScheduled, isoToMadridFields, madridToIso } from "./schedule";

describe("madridToIso", () => {
  // The whole point of going through Europe/Madrid explicitly: these hold in
  // whatever zone the test (or a promoter's laptop) happens to run in.
  it("applies the winter offset (+1)", () => {
    expect(madridToIso("2026-11-25", "20:00")).toBe("2026-11-25T19:00:00.000Z");
  });

  it("applies the summer offset (+2)", () => {
    expect(madridToIso("2026-07-04", "22:30")).toBe("2026-07-04T20:30:00.000Z");
  });

  it("drops seconds and accepts HH:MM:SS", () => {
    expect(madridToIso("2026-11-25", "20:00:00")).toBe("2026-11-25T19:00:00.000Z");
  });

  it("gets the day after the clocks change right", () => {
    // DST ended 25 Oct 2026 at 03:00 CEST -> 02:00 CET.
    expect(madridToIso("2026-10-24", "20:00")).toBe("2026-10-24T18:00:00.000Z");
    expect(madridToIso("2026-10-26", "20:00")).toBe("2026-10-26T19:00:00.000Z");
  });

  it("rejects malformed input", () => {
    expect(madridToIso("25/11/2026", "20:00")).toBeNull();
    expect(madridToIso("2026-11-25", "8pm")).toBeNull();
    expect(madridToIso("", "")).toBeNull();
  });

  it("round-trips through isoToMadridFields", () => {
    for (const [date, time] of [
      ["2026-11-25", "20:00"],
      ["2026-07-04", "22:30"],
      ["2026-01-01", "00:00"],
    ]) {
      expect(isoToMadridFields(madridToIso(date, time) as string)).toEqual({ date, time });
    }
  });
});

describe("checkPublishAt", () => {
  const now = new Date("2026-11-20T12:00:00.000Z");
  const show = { date: "2026-11-28", time: "21:00" };

  it("accepts a future time before the show", () => {
    expect(checkPublishAt("2026-11-25T19:00:00.000Z", show, now)).toBeNull();
  });

  it("refuses a time that has passed, with a minute's grace", () => {
    expect(checkPublishAt("2026-11-20T11:00:00.000Z", show, now)).toBe("past");
    expect(checkPublishAt("2026-11-20T12:00:30.000Z", show, now)).toBe("past");
    expect(checkPublishAt("2026-11-20T12:02:00.000Z", show, now)).toBeNull();
  });

  it("refuses a time at or after the show starts (Madrid clock)", () => {
    // 21:00 Madrid on 28 Nov is 20:00Z.
    expect(checkPublishAt("2026-11-28T20:00:00.000Z", show, now)).toBe("afterShow");
    expect(checkPublishAt("2026-11-28T19:59:00.000Z", show, now)).toBeNull();
  });

  it("flags garbage", () => {
    expect(checkPublishAt("soon", show, now)).toBe("invalid");
  });
});

describe("isScheduled", () => {
  it("is pending only while hidden with a time", () => {
    expect(isScheduled({ active: false, publishAt: "2026-11-25T19:00:00.000Z" })).toBe(true);
    expect(isScheduled({ active: true, publishAt: null })).toBe(false);
    expect(isScheduled({ active: false, publishAt: null })).toBe(false);
  });
});

describe("formatPublishAt", () => {
  it("renders on the Madrid clock", () => {
    expect(formatPublishAt("2026-11-25T19:00:00.000Z", "en-GB")).toMatch(/25 Nov.*20:00/);
  });
});
