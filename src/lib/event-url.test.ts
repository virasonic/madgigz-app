import { describe, expect, it } from "vitest";
import { eventPath, legacyEventPath, parseEventPath } from "./event-url";

describe("eventPath", () => {
  it("builds /event/yyyy/mm/dd/slug from a slugged event", () => {
    expect(eventPath({ id: "abc", slug: "weyvir-sala-x", date: "2026-11-28" })).toBe(
      "/event/2026/11/28/weyvir-sala-x"
    );
  });

  it("falls back to /e/<id> when the slug is missing (pre-addendum_073 database)", () => {
    expect(eventPath({ id: "abc", slug: null, date: "2026-11-28" })).toBe("/e/abc");
    expect(eventPath({ id: "abc", slug: "", date: "2026-11-28" })).toBe("/e/abc");
  });

  it("falls back to /e/<id> when the date is unparseable", () => {
    expect(eventPath({ id: "abc", slug: "x", date: "soon" })).toBe("/e/abc");
  });

  it("uses only the calendar day of a timestamp", () => {
    expect(eventPath({ id: "abc", slug: "x", date: "2026-01-05T22:00:00.000Z" })).toBe(
      "/event/2026/01/05/x"
    );
  });

  it("legacyEventPath is the old shape", () => {
    expect(legacyEventPath("abc")).toBe("/e/abc");
  });
});

describe("parseEventPath", () => {
  it("parses the canonical shape", () => {
    expect(parseEventPath(["2026", "11", "28", "weyvir-sala-x"])).toEqual({
      date: "2026-11-28",
      slug: "weyvir-sala-x",
    });
  });

  it("normalises single-digit month and day", () => {
    expect(parseEventPath(["2026", "9", "5", "gig"])).toEqual({ date: "2026-09-05", slug: "gig" });
  });

  it("accepts a de-duplicated slug", () => {
    expect(parseEventPath(["2026", "11", "28", "gig-2"])?.slug).toBe("gig-2");
  });

  it("rejects the wrong number of segments", () => {
    expect(parseEventPath([])).toBeNull();
    expect(parseEventPath(["2026", "11", "28"])).toBeNull();
    expect(parseEventPath(["2026", "11", "28", "gig", "extra"])).toBeNull();
  });

  it("rejects implausible dates", () => {
    expect(parseEventPath(["2026", "13", "01", "gig"])).toBeNull();
    expect(parseEventPath(["2026", "00", "01", "gig"])).toBeNull();
    expect(parseEventPath(["2026", "11", "32", "gig"])).toBeNull();
    expect(parseEventPath(["26", "11", "28", "gig"])).toBeNull();
    expect(parseEventPath(["2026", "nov", "28", "gig"])).toBeNull();
  });

  it("rejects slugs that are not ours", () => {
    expect(parseEventPath(["2026", "11", "28", "Gig"])).toBeNull();
    expect(parseEventPath(["2026", "11", "28", "gig_x"])).toBeNull();
    expect(parseEventPath(["2026", "11", "28", "-gig"])).toBeNull();
    expect(parseEventPath(["2026", "11", "28", "gig--x"])).toBeNull();
    expect(parseEventPath(["2026", "11", "28", "café"])).toBeNull();
    expect(parseEventPath(["2026", "11", "28", ""])).toBeNull();
    expect(parseEventPath(["2026", "11", "28", "a".repeat(81)])).toBeNull();
  });
});
