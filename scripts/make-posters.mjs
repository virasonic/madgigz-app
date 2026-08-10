// Placeholder posters for demo shows, drawn in the brand palette rather than
// pulled from picsum - a random stock photo reads as "unfinished" next to a
// real gig poster, and half the seeded shows currently have nothing at all.
//
// Generated with Python/Pillow (see the inline script) because the repo has no
// image toolchain, then uploaded to the same event-media bucket real posters
// use. Run with --apply to actually write to the database.
//
//   node scripts/make-posters.mjs .env.local           # dry run
//   node scripts/make-posters.mjs .env.local --apply
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
// Not URL.pathname: the repo lives in "MadGigz APP", and pathname leaves the
// space percent-encoded, so python3 is handed a file that doesn't exist.
import { fileURLToPath } from "node:url";

const env = Object.fromEntries(
  readFileSync(process.argv[2] ?? ".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);
const apply = process.argv.includes("--apply");

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// By default only shows with NO poster at all. The picsum ones are placeholders
// too, but they are placeholders someone can see - overwriting them throws away
// the old URL, so that needs asking for explicitly.
const includePicsum = process.argv.includes("--include-picsum");

const { data: events } = await admin
  .from("events")
  .select("id, title, artist_name, venue, event_date, accent_color, image_url")
  .order("event_date");

const targets = (events ?? []).filter((e) =>
  includePicsum ? !e.image_url || e.image_url.includes("picsum.photos") : !e.image_url
);

console.log(`${targets.length} shows need a poster\n`);

for (const ev of targets) {
  const date = new Date(ev.event_date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  const png = execFileSync(
    "python3",
    [fileURLToPath(new URL("./poster.py", import.meta.url))],
    {
      input: JSON.stringify({
        title: ev.title,
        artist: ev.artist_name,
        venue: ev.venue,
        date,
        accent: ev.accent_color || "#d76616",
        seed: ev.id,
      }),
      // No encoding option at all: that makes execFileSync return a Buffer,
      // which is what we want for PNG bytes. Passing encoding: "buffer" is
      // rejected by Node 26 as an unknown encoding.
      maxBuffer: 32 * 1024 * 1024,
    }
  );

  console.log(`  ${ev.title.padEnd(32)} ${(png.length / 1024).toFixed(0)}KB`);

  if (!apply) continue;

  const path = `posters/${ev.id}.png`;
  const { error: upErr } = await admin.storage
    .from("event-media")
    .upload(path, png, { contentType: "image/png", upsert: true });
  if (upErr) {
    console.error(`    upload failed: ${upErr.message}`);
    continue;
  }

  const {
    data: { publicUrl },
  } = admin.storage.from("event-media").getPublicUrl(path);

  const { error } = await admin.from("events").update({ image_url: publicUrl }).eq("id", ev.id);
  if (error) console.error(`    db update failed: ${error.message}`);
  else console.log(`    -> ${publicUrl}`);
}

if (!apply) console.log("\nDry run. Re-run with --apply to upload and save.");
