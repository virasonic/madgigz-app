// Writes the MadGigz intro cards to the feed as announcements (addendum_028).
//
// Idempotent: every card carries a marker in its caption and existing ones are
// removed before re-posting, so this can be re-run after a copy change without
// leaving two of everything on the feed.
//
//   node scripts/post-intro-cards.mjs .env.local            # render only
//   node scripts/post-intro-cards.mjs .env.local --apply    # upload and post
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
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

const ORANGE = "#d76616";
const TEAL = "#54c3bd";

// Ordered as they should be met. The feed weaves one in every few reels, so
// each card has to stand alone - no "as we said in the last one".
const CARDS = [
  {
    key: "what-01",
    eyebrow: "What is MadGigz",
    headline: "Live music in Madrid, without the middleman.",
    body: "Small rooms, local acts, real tickets. Find a gig tonight or plan next month.",
    accent: ORANGE,
    caption: "Welcome to MadGigz. Independent live music in Madrid - here's how it works.",
  },
  {
    key: "what-02",
    eyebrow: "What is MadGigz",
    headline: "The price you see is the price you pay.",
    body: "No booking fee bolted on at checkout. MadGigz takes 5% from the artist, and that's it.",
    accent: ORANGE,
    caption: "No surprise fees at checkout. What's on the ticket is what you pay.",
  },
  {
    key: "fan-01",
    eyebrow: "For fans",
    step: "1 of 3",
    headline: "Find something on tonight.",
    body: "Explore searches by artist, venue and genre. This Week shows the next seven days.",
    accent: TEAL,
    caption: "Finding a gig: Explore for everything, This Week for what's imminent.",
  },
  {
    key: "fan-02",
    eyebrow: "For fans",
    step: "2 of 3",
    headline: "Tap the show, pick your tickets, pay.",
    body: "Card payments through Stripe. Your ticket appears in the Tickets tab straight away.",
    accent: TEAL,
    caption: "Buying takes about thirty seconds. Tickets land in your Tickets tab.",
  },
  {
    key: "fan-03",
    eyebrow: "For fans",
    step: "3 of 3",
    headline: "Show the QR code at the door.",
    body: "It's in your ticket, with a map link to the venue. Screenshot it if signal is bad.",
    accent: TEAL,
    caption: "At the door: open your ticket, show the QR. There's a map link on it too.",
  },
  {
    key: "artist-01",
    eyebrow: "For artists",
    step: "1 of 3",
    headline: "Claim your artist profile.",
    body: "Sign up as an artist and send us a link that shows the act is yours. We check by hand.",
    accent: ORANGE,
    caption: "Artists: claim your profile first. We verify every one by hand.",
  },
  {
    key: "artist-02",
    eyebrow: "For artists",
    step: "2 of 3",
    headline: "Connect payouts, then post your show.",
    body: "Money goes to your account, not ours. Set the price and you'll see exactly what you receive.",
    accent: ORANGE,
    caption: "Payouts go straight to you through Stripe. You see your cut before you publish.",
  },
  {
    key: "artist-03",
    eyebrow: "For artists",
    step: "3 of 3",
    headline: "Scan tickets at the door yourself.",
    body: "Open Scan Tickets on your phone. No printed list, no guest-list confusion.",
    accent: ORANGE,
    caption: "Your phone is the door scanner. Scan Tickets is in your profile.",
  },
  {
    key: "content-01",
    eyebrow: "Posting content",
    headline: "Put a clip up. That's the feed.",
    body: "Photos and video from rehearsals, soundchecks and last night. It links back to your show.",
    accent: TEAL,
    caption: "The feed is artist content. Post a clip and it links back to your gig.",
  },
  {
    key: "content-02",
    eyebrow: "Posting content",
    headline: "Tag the rest of the bill.",
    body: "Tagged artists get the show on their profile and can post about it too.",
    accent: TEAL,
    caption: "Tag the other acts on the bill - the show shows up on their profile as well.",
  },
];

// Lives in show_title, not the caption. show_title is meaningless for an
// announcement (there is no show) and nothing renders it, whereas the caption
// is read by every person who scrolls past - the first version of this printed
// "[mgz-intro]" on the feed.
const MARKER = "mgz-intro";
const OUT = fileURLToPath(new URL("../.intro-cards/", import.meta.url));
mkdirSync(OUT, { recursive: true });

// Posted as MadGigz itself, through the account Vir uses as admin.
const { data: author } = await admin
  .from("profiles")
  .select("id, username, artist_name")
  .eq("role", "admin")
  .eq("username", "viradmin")
  .single();

if (!author) {
  console.error("No viradmin profile found - who should these be posted as?");
  process.exit(1);
}
console.log(`Posting as ${author.artist_name ?? author.username} (${author.id})\n`);

if (apply) {
  // Clear previous runs first, so a copy edit replaces rather than duplicates.
  const { data: old } = await admin
    .from("content_posts")
    .select("id")
    .is("event_id", null)
    .eq("show_title", MARKER);
  if (old?.length) {
    await admin.from("content_posts").delete().in("id", old.map((o) => o.id));
    console.log(`removed ${old.length} card(s) from a previous run\n`);
  }
}

for (const card of CARDS) {
  const png = execFileSync("python3", [fileURLToPath(new URL("./intro-card.py", import.meta.url))], {
    input: JSON.stringify(card),
    maxBuffer: 32 * 1024 * 1024,
  });

  writeFileSync(`${OUT}${card.key}.png`, png);
  console.log(`  ${card.key.padEnd(12)} ${(png.length / 1024).toFixed(0)}KB  ${card.headline}`);

  if (!apply) continue;

  // Content-hashed. Uploading a redesigned card to the same path with
  // upsert:true keeps the URL identical, so browsers and the CDN happily serve
  // the previous artwork forever - which is exactly what happened the first
  // time these were re-posted. A new URL per revision cannot be cached stale.
  const digest = createHash("sha256").update(png).digest("hex").slice(0, 10);
  const path = `announcements/${card.key}-${digest}.png`;
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

  const { error } = await admin.from("content_posts").insert({
    event_id: null,
    artist_id: author.id,
    artist_name: "MadGigz",
    show_title: MARKER,
    caption: card.caption,
    media_url: publicUrl,
    media_type: "image",
  });
  if (error) console.error(`    insert failed: ${error.message}`);
}

console.log(`\nPNGs written to .intro-cards/`);
if (!apply) console.log("Render only. Re-run with --apply to upload and post.");
