// Pure parse + per-field validation for the bulk gig importer (#111). No server
// imports and no DB access, so it is unit-testable on its own (see
// scripts/test-gig-import.mjs) and can't drift between preview and commit - the
// server action (gig-import.ts) calls this once, then only adds the parts that
// genuinely need the database: dedup against existing rows and the insert.

const AGE_OPTIONS = ["All ages", "16+", "18+", "21+"];
const DEFAULT_AGE = "18+"; // same default the New Show form uses
const DEFAULT_TIME = "21:00";
const DEFAULT_CAPACITY = 100; // cosmetic for external shows (nothing sold here)

// The columns we understand, and every header spelling that maps to each. Headers
// are normalised (lowercased, non-alphanumerics stripped) before lookup, so
// "Ticket URL", "ticket_url" and "ticketlink" all land on the same field.
const HEADER_ALIASES: Record<string, string[]> = {
  title: ["title", "show", "name", "event", "gig"],
  artist: ["artist", "billedas", "billed", "act", "headliner", "performer"],
  // A separate column for the full bill. Split into the lineup array (not the
  // single artist_name headline). When absent, the lineup is derived from a
  // multi-name artist field below.
  lineup: ["lineup", "artists", "acts", "performers", "billing", "fullbill", "line/up"],
  venue: ["venue", "location", "place", "hall", "club"],
  date: ["date", "eventdate", "day"],
  time: ["time", "starttime", "start", "doors"],
  price: ["price", "cost", "from", "fromprice"],
  ticketurl: ["ticketurl", "ticketlink", "url", "link", "tickets", "ticket"],
  description: ["description", "desc", "about", "info", "notes"],
  genre: ["genre", "genres", "category", "style", "styles"],
  age: ["age", "agerestriction", "agelimit", "ages"],
  image: ["image", "imageurl", "poster", "posterurl", "art", "artwork"],
  capacity: ["capacity", "cap", "seats"],
};

// Split a bill into individual acts on commas / semicolons / pipes / " x " /
// " + " (common festival-poster separators). Trims and drops blanks.
function splitBill(raw: string): string[] {
  return raw
    .split(/\s*[,;|]\s*|\s+[x+]\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

const REQUIRED_COLUMNS = ["title", "artist", "venue", "date", "ticketurl"];

function normaliseHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function fieldForHeader(normalised: string): string | null {
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(normalised)) return field;
  }
  return null;
}

// A CSV/TSV tokeniser over the whole text: honours double-quoted fields (so a
// description containing the delimiter, or a newline, survives) and the chosen
// delimiter. Spreadsheet copy-paste is tab-delimited and needs no quoting; a
// pasted .csv is comma-delimited and might. Auto-detected from the first line.
function parseDelimited(text: string): string[][] {
  const nl = text.indexOf("\n");
  const firstLine = text.slice(0, nl === -1 ? text.length : nl);
  const delim = firstLine.includes("\t") ? "\t" : ",";

  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function normaliseDate(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  let year: number, month: number, day: number;
  if (m) {
    year = Number(m[1]);
    month = Number(m[2]);
    day = Number(m[3]);
  } else {
    // Day-first DD/MM/YYYY (the Spanish convention), 2- or 4-digit year: an
    // ambiguous 03/04 is 3 April, never 4 March.
    m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
    if (!m) return null;
    day = Number(m[1]);
    month = Number(m[2]);
    year = Number(m[3]);
    if (year < 100) year += 2000;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  // Round-trip through Date to reject 31 Feb etc.
  const d = new Date(`${iso}T00:00:00Z`);
  if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) {
    return null;
  }
  return iso;
}

function normaliseTime(raw: string): string | null {
  const v = raw.trim();
  if (!v) return DEFAULT_TIME;
  const m = v.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function normalisePrice(raw: string): number | null {
  const v = raw.trim().replace(/[€$£\s]/g, "").replace(",", ".");
  if (!v) return 0;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function normaliseAge(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (!v) return DEFAULT_AGE;
  if (v.includes("all") || v === "0" || v.includes("todas")) return "All ages";
  if (v.includes("21")) return "21+";
  if (v.includes("18")) return "18+";
  if (v.includes("16")) return "16+";
  return AGE_OPTIONS.includes(raw.trim()) ? raw.trim() : DEFAULT_AGE;
}

function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export function dedupKey(title: string, venue: string, date: string): string {
  return `${title.trim().toLowerCase()}|${venue.trim().toLowerCase()}|${date}`;
}

interface ParsedGig {
  line: number;
  title: string;
  artist: string;
  lineup: string[];
  venue: string;
  date: string; // normalised ISO, or "" when unreadable
  rawDate: string;
  time: string; // normalised HH:MM (defaulted when blank)
  price: number; // 0 when blank
  ticketUrl: string;
  genre: string;
  age: string; // normalised to an AGE_OPTIONS value
  image: string;
  capacity: number;
  description: string;
  fieldError: string | null; // null => every field is valid
}

interface ParseOutput {
  error?: string; // whole-paste problem (empty, no header, missing columns)
  gigs: ParsedGig[];
}

export function parseGigText(text: string): ParseOutput {
  if (!text.trim()) return { error: "Nothing pasted.", gigs: [] };

  const grid = parseDelimited(text);
  if (grid.length < 2) {
    return { error: "Need a header row and at least one gig row.", gigs: [] };
  }

  const header = grid[0].map((h) => fieldForHeader(normaliseHeader(h)));
  const known = new Set(header.filter((f): f is string => f !== null));
  const missing = REQUIRED_COLUMNS.filter((f) => !known.has(f));
  if (missing.length > 0) {
    const label = missing.map((m) => (m === "ticketurl" ? "ticket_url" : m)).join(", ");
    return {
      error: `Missing required column(s): ${label}. Required: title, artist, venue, date, ticket_url.`,
      gigs: [],
    };
  }

  const gigs = grid.slice(1).map((cells, i): ParsedGig => {
    const byField = new Map<string, string>();
    header.forEach((field, idx) => {
      if (field && !byField.has(field)) byField.set(field, (cells[idx] ?? "").trim());
    });
    const get = (f: string) => byField.get(f) ?? "";

    const title = get("title");
    const artist = get("artist");
    // Prefer an explicit lineup column; otherwise derive the bill from a
    // multi-name artist field (e.g. "A, B, C"). A single-act artist yields no
    // lineup — the artist_name headline already carries it, so no redundant
    // one-item bill.
    const lineupCol = get("lineup");
    const derivedFromArtist = splitBill(artist);
    const lineup = lineupCol
      ? splitBill(lineupCol)
      : derivedFromArtist.length > 1
        ? derivedFromArtist
        : [];
    const venue = get("venue");
    const rawDate = get("date");
    const date = normaliseDate(rawDate);
    const time = normaliseTime(get("time"));
    const price = normalisePrice(get("price"));
    const ticketUrl = get("ticketurl");
    const capRaw = Number(get("capacity").trim());
    const capacity = Number.isInteger(capRaw) && capRaw >= 1 ? capRaw : DEFAULT_CAPACITY;

    const fieldError =
      !title
        ? "Missing title"
        : !artist
          ? "Missing artist"
          : !venue
            ? "Missing venue"
            : !date
              ? `Unreadable date "${rawDate}" (use YYYY-MM-DD or DD/MM/YYYY)`
              : time === null
                ? `Unreadable time "${get("time")}" (use HH:MM)`
                : price === null
                  ? `Unreadable price "${get("price")}"`
                  : !ticketUrl
                    ? "Missing ticket link"
                    : !isValidHttpUrl(ticketUrl)
                      ? "Ticket link must be a valid https:// URL"
                      : null;

    return {
      line: i + 1,
      title,
      artist,
      lineup,
      venue,
      date: date ?? "",
      rawDate,
      time: time ?? "",
      price: price ?? 0,
      ticketUrl,
      genre: get("genre"),
      age: normaliseAge(get("age")),
      image: get("image"),
      capacity,
      description: get("description"),
      fieldError,
    };
  });

  return { gigs };
}
