// Read-path load probe. Safe by construction: it only issues the public,
// anon-key SELECTs the feed/explore make on a page load - no accounts created,
// no emails sent, no writes. It fires C concurrent "page loads" (each a bundle
// of the queries a real feed render runs in parallel) and reports the latency
// curve as concurrency climbs, which is exactly how "100 users at once" would
// feel on the read path.
//
// Run:  node scripts/load-probe.mjs
// It reads the project URL + anon key from .env.local, same as the probe scripts.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(root, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY in .env.local");
  process.exit(1);
}
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

// The public reads a signed-out feed / explore render fires in parallel. These
// are the anon-readable ones; the auth-scoped ones (saved, followed, tickets)
// can't be measured without a session and are analysed separately.
const QUERIES = [
  "/rest/v1/events?select=id,title,event_date,event_time,price,venue,image_url,accent_color,category,capacity,sold&active=eq.true&order=event_date",
  "/rest/v1/content_posts?select=id,event_id,caption,media_url,media_type,created_at&order=created_at.desc&limit=40",
  "/rest/v1/genres?select=id,name&order=name",
  "/rest/v1/venues?select=id,name,address&order=name",
];

async function pageLoad() {
  const t0 = performance.now();
  const results = await Promise.all(
    QUERIES.map((q) =>
      fetch(URL + q, { headers })
        .then((r) => r.status)
        .catch(() => 0)
    )
  );
  const ms = performance.now() - t0;
  const ok = results.every((s) => s >= 200 && s < 300);
  return { ms, ok, statuses: results };
}

function pct(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function runLevel(concurrency, rounds) {
  const samples = [];
  let errors = 0;
  const badStatuses = new Set();
  for (let r = 0; r < rounds; r++) {
    const batch = await Promise.all(Array.from({ length: concurrency }, pageLoad));
    for (const b of batch) {
      samples.push(b.ms);
      if (!b.ok) {
        errors++;
        b.statuses.forEach((s) => (s < 200 || s >= 300) && badStatuses.add(s));
      }
    }
  }
  samples.sort((a, b) => a - b);
  return {
    concurrency,
    n: samples.length,
    p50: Math.round(pct(samples, 50)),
    p95: Math.round(pct(samples, 95)),
    max: Math.round(samples[samples.length - 1]),
    errors,
    badStatuses: [...badStatuses],
  };
}

console.log(`Target: ${URL}`);
console.log("Each 'page load' = 4 parallel public feed queries.\n");
console.log("concurrency |   n | p50(ms) | p95(ms) | max(ms) | errors");
console.log("------------+-----+---------+---------+---------+-------");
for (const c of [1, 10, 30, 60]) {
  const rounds = c <= 10 ? 5 : 3; // keep total requests modest
  const row = await runLevel(c, rounds);
  console.log(
    `${String(row.concurrency).padStart(11)} | ${String(row.n).padStart(3)} | ` +
      `${String(row.p50).padStart(7)} | ${String(row.p95).padStart(7)} | ` +
      `${String(row.max).padStart(7)} | ${row.errors}${
        row.badStatuses.length ? " " + JSON.stringify(row.badStatuses) : ""
      }`
  );
}
console.log("\nRead-only probe complete. No accounts created, no emails sent.");
