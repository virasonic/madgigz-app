// Unit test for the pure gig-import parsing core (#111). Standalone, like the
// other scripts/*.mjs probes. Bundles the TS module to JS with esbuild, then
// asserts on real behaviour through the public parseGigText — the normalisers
// (date/time/price/age), the header aliasing, CSV quoting and the required-column
// check are all observable in its output, so this covers them without exporting
// the internals.
//
//   node scripts/test-gig-import.mjs
import { execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src/app/admin/events/import/gig-import-parse.ts");
const out = join(mkdtempSync(join(tmpdir(), "gigparse-")), "parse.mjs");
execSync(
  `npx esbuild ${JSON.stringify(SRC)} --bundle --format=esm --platform=node --outfile=${JSON.stringify(out)}`,
  { cwd: ROOT, stdio: "inherit" }
);
const { parseGigText, dedupKey } = await import(out);

let pass = 0;
let fail = 0;
function eq(label, got, want) {
  if (JSON.stringify(got) === JSON.stringify(want)) {
    pass++;
  } else {
    fail++;
    console.log(`✗ ${label}\n   got  ${JSON.stringify(got)}\n   want ${JSON.stringify(want)}`);
  }
}

// One TSV covering: header aliases (Billed as -> artist, Ticket Link -> url),
// ISO + day-first dates, €/comma prices, time padding, and every field-error.
const header =
  "Title\tBilled as\tVenue\tDate\tTime\tPrice\tTicket Link\tGenre\tAge\tCapacity";
const rows = [
  "Noche Flamenca\tRosalía\tLa Riviera\t2026-09-12\t21:00\t€28\thttps://entradium.com/e/x\tFlamenco\t18+\t900",
  "Indie Night\tHinds\tSala But\t14/09/2026\t8:30\t18,50\thttps://dice.fm/e/y\tIndie\t16\t",
  "No URL\tAct\tVenue\t01/01/2027\t20:00\t10\t\t\t\t",
  "Bad Date\tAct\tVenue\tnotadate\t20:00\t10\thttps://x.com/z\t\t\t",
  "Bad Price\tAct\tVenue\t02/01/2027\t20:00\tfree\thttps://x.com/z\t\t\t",
  "Junk URL\tAct\tVenue\t03/01/2027\t20:00\t10\tnot-a-url\t\t\t",
];
const r = parseGigText([header, ...rows].join("\n"));

eq("no whole-paste error", r.error, undefined);
eq("6 rows parsed", r.gigs.length, 6);

// Row 1 — fully valid, aliases + normalisation
eq("r1 valid", r.gigs[0].fieldError, null);
eq("r1 artist via 'Billed as'", r.gigs[0].artist, "Rosalía");
eq("r1 ISO date", r.gigs[0].date, "2026-09-12");
eq("r1 euro price", r.gigs[0].price, 28);
eq("r1 age", r.gigs[0].age, "18+");
eq("r1 capacity", r.gigs[0].capacity, 900);

// Row 2 — day-first date, time pad, comma decimal, age fuzzy, capacity default
eq("r2 valid", r.gigs[1].fieldError, null);
eq("r2 day-first date", r.gigs[1].date, "2026-09-14");
eq("r2 time padded", r.gigs[1].time, "08:30");
eq("r2 comma price", r.gigs[1].price, 18.5);
eq("r2 age fuzzy 16 -> 16+", r.gigs[1].age, "16+");
eq("r2 capacity default 100", r.gigs[1].capacity, 100);

// Rows 3-6 — field errors
eq("r3 missing url", r.gigs[2].fieldError, "Missing ticket link");
eq(
  "r4 bad date",
  r.gigs[3].fieldError,
  'Unreadable date "notadate" (use YYYY-MM-DD or DD/MM/YYYY)'
);
eq("r5 bad price", r.gigs[4].fieldError, 'Unreadable price "free"');
eq("r6 junk url", r.gigs[5].fieldError, "Ticket link must be a valid https:// URL");

// CSV with a quoted comma inside title + description
const csv = [
  "title,artist,venue,date,ticket_url,description",
  '"Jazz, Live","Trio","El Sol","2026-10-01","https://x.com/a","soul, funk & jazz"',
].join("\n");
const rc = parseGigText(csv);
eq("csv 1 gig", rc.gigs.length, 1);
eq("csv quoted title", rc.gigs[0].title, "Jazz, Live");
eq("csv quoted desc", rc.gigs[0].description, "soul, funk & jazz");

// Line-up (#111 fix) — a multi-act bill fills the line-up; a single act doesn't.
eq("r1 single act, no lineup", r.gigs[0].lineup.length, 0);
const bill = parseGigText(
  "title,artist,venue,date,ticket_url\n" +
    'Trio Night,"A Sax, B Bass, C Drums",El Sol,2026-10-01,https://x.com/a\n' +
    "Solo,Just Me,El Sol,2026-10-02,https://x.com/b"
);
eq(
  "multi-act artist splits to lineup",
  JSON.stringify(bill.gigs[0].lineup),
  JSON.stringify(["A Sax", "B Bass", "C Drums"])
);
eq("multi-act keeps headline artist", bill.gigs[0].artist, "A Sax, B Bass, C Drums");
eq("single act -> no lineup", bill.gigs[1].lineup.length, 0);

// An explicit lineup column wins over the artist field.
const withCol = parseGigText(
  "title,artist,lineup,venue,date,ticket_url\n" +
    'Fest,Headliner,"X; Y; Z",El Sol,2026-10-03,https://x.com/c'
);
eq(
  "explicit lineup column",
  JSON.stringify(withCol.gigs[0].lineup),
  JSON.stringify(["X", "Y", "Z"])
);
eq("explicit lineup keeps artist headline", withCol.gigs[0].artist, "Headliner");
eq("csv valid", rc.gigs[0].fieldError, null);

// Whole-paste failures
eq("empty errors", Boolean(parseGigText("").error), true);
eq("header-only errors", Boolean(parseGigText("title,artist,venue,date,ticket_url").error), true);
eq(
  "missing column errors",
  Boolean(parseGigText("title,artist,venue,date\nA,B,C,2026-01-01").error),
  true
);

// dedup key is stable + case/space-insensitive on title & venue
eq(
  "dedup key normalises",
  dedupKey("  Noche Flamenca ", "la riviera", "2026-09-12"),
  dedupKey("noche flamenca", "La Riviera", "2026-09-12")
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
