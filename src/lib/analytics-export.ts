import { createHmac } from "node:crypto";

// Analytics exports for the part-time analyst (#228). Pure helpers, no I/O, so
// the escaping, the pseudonymisation and the date-range parsing are unit-tested
// and the route handler stays thin.

export type CsvCell = string | number | boolean | null | undefined;

// RFC 4180: quote a field that carries a comma, a quote or a newline, doubling
// any quote inside it. Booleans come out as true/false so a spreadsheet filter
// sees two values, not "yes"/"no"/"". A leading UTF-8 BOM is prepended so Excel
// on a Spanish locale opens the file as UTF-8 instead of guessing Latin-1 and
// mangling every venue name with an accent.
export function toCsv(header: string[], rows: CsvCell[][]): string {
  const esc = (value: CsvCell): string => {
    if (value === null || value === undefined) return "";
    let text = typeof value === "boolean" ? (value ? "true" : "false") : String(value);
    // Formula injection: several cells are user-typed (utm_* from any landing
    // URL, venue, city), and a spreadsheet runs a cell starting with = + - @ as
    // a formula. A leading apostrophe makes it plain text. Only strings are
    // touched, so a genuinely negative number stays a number.
    if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [header, ...rows].map((row) => row.map(esc).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

// One-way, keyed pseudonym for a user id. HMAC rather than a bare hash because
// the real ids are not secret (every public profile URL carries one), so a
// plain sha256 could be reversed by hashing the known ids and comparing. The
// key never leaves the server, and the same key gives the same pseudonym on
// every export, so the analyst can join users to their poster-wall exports
// across files without ever holding a real id. 32 hex chars (128 bits) is
// plenty to keep ids distinct.
export function anonymiseUserId(userId: string, secret: string): string {
  return createHmac("sha256", secret).update(userId).digest("hex").slice(0, 32);
}

// The signing key for the pseudonyms. Read at call time, never at module scope:
// a missing env var must not take the Vercel build down (CLAUDE.md). The two
// exports that need it refuse with a clear message instead.
export function exportSecret(): string | null {
  const secret = process.env.ANALYTICS_EXPORT_SECRET?.trim();
  return secret && secret.length >= 16 ? secret : null;
}

export interface DateRange {
  /** Inclusive lower bound as an ISO timestamp, or null for "from the start". */
  fromIso: string | null;
  /** EXCLUSIVE upper bound (the day after `to`) as an ISO timestamp, or null. */
  toIsoExclusive: string | null;
  /** The parsed inputs, for the filename. */
  from: string | null;
  to: string | null;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDay(value: string): boolean {
  if (!DAY_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

// Both bounds are calendar days (YYYY-MM-DD, as the date inputs send them) and
// both are inclusive from the analyst's point of view. Internally the upper
// bound becomes "strictly before the next midnight UTC" so a purchase at
// 23:59 on the last day is in. Returns null for anything malformed rather than
// silently exporting everything.
export function parseDateRange(from: string | null, to: string | null): DateRange | null {
  const f = from?.trim() || null;
  const t = to?.trim() || null;
  if (f && !validDay(f)) return null;
  if (t && !validDay(t)) return null;
  if (f && t && f > t) return null;

  let toIsoExclusive: string | null = null;
  if (t) {
    const next = new Date(`${t}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    toIsoExclusive = next.toISOString();
  }
  return {
    fromIso: f ? `${f}T00:00:00.000Z` : null,
    toIsoExclusive,
    from: f,
    to: t,
  };
}

export const EXPORT_DATASETS = ["shows", "tickets", "users", "poster_wall_exports"] as const;
export type ExportDataset = (typeof EXPORT_DATASETS)[number];

export function isExportDataset(value: string | null): value is ExportDataset {
  return (EXPORT_DATASETS as readonly string[]).includes(value ?? "");
}

export function exportFilename(dataset: ExportDataset, range: DateRange): string {
  const span = `${range.from ?? "start"}_${range.to ?? "today"}`;
  return `madgigz-${dataset}-${span}.csv`;
}
