import { describe, expect, it } from "vitest";
import {
  anonymiseUserId,
  exportFilename,
  isExportDataset,
  parseDateRange,
  toCsv,
} from "./analytics-export";

describe("toCsv", () => {
  it("quotes commas, quotes and newlines, and renders booleans/nulls", () => {
    const csv = toCsv(
      ["a", "b", "c", "d"],
      [["Sala, Madrid", 'He said "hi"', true, null], ["plain", "line\nbreak", false, 0]]
    );
    const lines = csv.replace(/^﻿/, "").split("\r\n");
    expect(lines[0]).toBe("a,b,c,d");
    expect(lines[1]).toBe('"Sala, Madrid","He said ""hi""",true,');
    expect(lines[2]).toBe('plain,"line\nbreak",false,0');
    expect(lines[3]).toBe("");
  });

  it("starts with a UTF-8 BOM so Excel reads accents correctly", () => {
    expect(toCsv(["x"], [["Ñ"]]).charCodeAt(0)).toBe(0xfeff);
  });
});

describe("anonymiseUserId", () => {
  const id = "9d5b2d0a-3c6e-4c47-9d9b-5b7b7e2a1c11";

  it("is deterministic for the same key and never contains the real id", () => {
    const a = anonymiseUserId(id, "k".repeat(32));
    expect(a).toBe(anonymiseUserId(id, "k".repeat(32)));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain(id.slice(0, 8));
  });

  it("changes with the key, so a leaked file cannot be joined to another key's file", () => {
    expect(anonymiseUserId(id, "a".repeat(32))).not.toBe(anonymiseUserId(id, "b".repeat(32)));
  });
});

describe("parseDateRange", () => {
  it("makes the upper bound inclusive by moving it to the next midnight UTC", () => {
    const r = parseDateRange("2026-10-01", "2026-10-31");
    expect(r?.fromIso).toBe("2026-10-01T00:00:00.000Z");
    expect(r?.toIsoExclusive).toBe("2026-11-01T00:00:00.000Z");
  });

  it("accepts open ends", () => {
    expect(parseDateRange(null, null)).toEqual({
      fromIso: null,
      toIsoExclusive: null,
      from: null,
      to: null,
    });
    expect(parseDateRange("", "2026-02-28")?.fromIso).toBeNull();
  });

  it("rejects malformed days, impossible dates and reversed ranges", () => {
    expect(parseDateRange("2026-13-01", null)).toBeNull();
    expect(parseDateRange("2026-02-30", null)).toBeNull();
    expect(parseDateRange("yesterday", null)).toBeNull();
    expect(parseDateRange("2026-10-31", "2026-10-01")).toBeNull();
  });
});

describe("dataset names", () => {
  it("only accepts the four known datasets", () => {
    expect(isExportDataset("shows")).toBe(true);
    expect(isExportDataset("poster_wall_exports")).toBe(true);
    expect(isExportDataset("profiles")).toBe(false);
    expect(isExportDataset(null)).toBe(false);
  });

  it("names the file after the dataset and the range", () => {
    const range = parseDateRange("2026-01-01", "2026-03-31")!;
    expect(exportFilename("tickets", range)).toBe("madgigz-tickets-2026-01-01_2026-03-31.csv");
    expect(exportFilename("users", parseDateRange(null, null)!)).toBe("madgigz-users-start_today.csv");
  });
});
