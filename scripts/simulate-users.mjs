// End-to-end user simulation / load harness.
//
// Spins up a self-contained synthetic COHORT - a handful of sim "artists"
// (approved, each with a show) and many sim "fans" - then has the fans onboard
// and use the app the way a real session does: sign in, load the feed and
// explore, follow an artist, save a show, check notifications. It measures how
// each of those holds up as concurrency climbs, then deletes the whole cohort.
//
// Why this is safe to point at the live project (same basis as the security
// probes, which already create + delete throwaway accounts here):
//   - Users are created via the Admin API with email_confirm:true, so NO email
//     is ever sent - it sidesteps the Supabase/Resend signup email limits that
//     gate real onboarding, and lets us actually load the DB instead of bouncing
//     off the email wall.
//   - It never touches Stripe or moves money. Ticket PURCHASE (a Stripe redirect)
//     is deliberately out of scope - see the skill doc.
//   - Every sim account is tagged @madgigz-loadtest.invalid and deleted in a
//     finally; deleting an auth user cascades its follows/saves/tickets. Follows
//     only ever target sim artists, so no real user gets a phantom notification.
//   - It is DRY-RUN unless you pass --go, and defaults to a modest cohort.
//
// Usage:
//   node scripts/simulate-users.mjs                 # dry run: explain + check
//   node scripts/simulate-users.mjs --go            # run with defaults (25 users)
//   node scripts/simulate-users.mjs --go --users=100 --concurrency=1,10,30,60
//   node scripts/simulate-users.mjs --cleanup       # sweep leftovers from a crash
//   node scripts/simulate-users.mjs --go --env=.env.staging
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// ---- args ------------------------------------------------------------------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  })
);
const GO = Boolean(args.go);
const CLEANUP = Boolean(args.cleanup);
const ENV_FILE = args.env ?? ".env.local";
const TOTAL_USERS = Number(args.users ?? 25);
const LEVELS = String(args.concurrency ?? "1,10,25")
  .split(",")
  .map((n) => Number(n.trim()))
  .filter((n) => n > 0);
const ROUNDS = Number(args.rounds ?? 3);

const EMAIL_DOMAIN = "madgigz-loadtest.invalid";
const PROVISION_CONCURRENCY = 10; // cap so we don't hammer GoTrue's admin API

// ---- env -------------------------------------------------------------------
const env = Object.fromEntries(
  readFileSync(ENV_FILE, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON || !SERVICE) {
  console.error(`Missing Supabase keys in ${ENV_FILE} (need URL, ANON, SERVICE_ROLE).`);
  process.exit(1);
}
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

// ---- helpers ---------------------------------------------------------------
const pct = (sorted, p) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0;

function stats(times) {
  const s = [...times].sort((a, b) => a - b);
  return { n: s.length, p50: Math.round(pct(s, 50)), p95: Math.round(pct(s, 95)), max: Math.round(s[s.length - 1] ?? 0) };
}

async function mapLimit(items, limit, fn) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

async function timed(op, fn) {
  const t0 = performance.now();
  try {
    const r = await fn();
    const ok = !(r && r.error);
    return { op, ms: performance.now() - t0, ok, detail: r?.error?.message };
  } catch (e) {
    return { op, ms: performance.now() - t0, ok: false, detail: e.message };
  }
}

// ---- cleanup (also used by --cleanup and by the finally) -------------------
async function sweepCohort() {
  let removed = 0;
  // listUsers is paginated; walk until a page has none of ours.
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) break;
    const ours = data.users.filter((u) => u.email?.endsWith(`@${EMAIL_DOMAIN}`));
    for (const u of ours) {
      await admin.auth.admin.deleteUser(u.id);
      removed++;
    }
    if (data.users.length < 200) break;
  }
  // Sim events are tagged in the title; delete any strays.
  await admin.from("events").delete().like("title", "LOADTEST — %");
  return removed;
}

// ---- main ------------------------------------------------------------------
async function main() {
  const isProd =
    URL.includes(env.NEXT_PUBLIC_APP_URL ?? "@@") || !ENV_FILE.includes("staging");
  console.log(`\nMadGigz user simulation`);
  console.log(`  target      : ${URL}`);
  console.log(`  env file    : ${ENV_FILE}`);
  console.log(`  cohort      : ${TOTAL_USERS} users (~10% artists, ~90% fans)`);
  console.log(`  concurrency : ${LEVELS.join(", ")}  (${ROUNDS} rounds each)`);
  console.log(`  email domain: @${EMAIL_DOMAIN}  (no mail is ever sent)`);

  if (CLEANUP) {
    console.log(`\n--cleanup: sweeping any leftover sim accounts...`);
    const n = await sweepCohort();
    console.log(`removed ${n} leftover sim account(s).`);
    return;
  }

  if (!GO) {
    console.log(`\nDRY RUN. This would:`);
    console.log(`  1. create ${TOTAL_USERS} pre-confirmed sim users (no emails sent)`);
    console.log(`  2. give the sim artists an approved profile + one show each`);
    console.log(`  3. run fan sessions (sign in, feed, explore, follow, save, notifications)`);
    console.log(`     at concurrency ${LEVELS.join("/")} and measure latency`);
    console.log(`  4. delete every sim account + show (cascades follows/saves/tickets)`);
    console.log(`\nNothing was created. Re-run with --go to execute.`);
    // Prove the keys work and report how busy the project already is.
    const { count } = await admin.from("events").select("id", { count: "exact", head: true }).eq("active", true);
    console.log(`Connectivity OK — ${count ?? "?"} active events currently live.`);
    if (isProd) console.log(`NOTE: this looks like the PRODUCTION project. Sim data is tagged and torn down, but consider --env=.env.staging if you have one.`);
    return;
  }

  const runId = Date.now().toString(36).slice(-6);
  const numArtists = Math.max(2, Math.round(TOTAL_USERS * 0.1));
  const numFans = TOTAL_USERS - numArtists;
  const created = []; // {id, email, password, role}
  const simEventIds = [];

  try {
    // ---- Phase 1: onboarding (provisioning) --------------------------------
    console.log(`\n── Phase 1: onboarding ${TOTAL_USERS} users ──`);
    const provisionResults = [];
    const t0 = performance.now();

    async function provision(role, n) {
      const email = `sim.${runId}.${role}${n}@${EMAIL_DOMAIN}`;
      const password = `Load!${runId}${n}Aa1`;
      const username = `sim${runId}${role[0]}${n}`.slice(0, 30);
      const r = await timed("createUser", () =>
        admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { username, role, date_of_birth: "1996-05-05" },
        })
      );
      provisionResults.push(r);
      if (r.ok) return { email, password, role, username };
      return null;
    }

    const artistSpecs = Array.from({ length: numArtists }, (_, i) => ["artist", i]);
    const fanSpecs = Array.from({ length: numFans }, (_, i) => ["fan", i]);
    const provisioned = await mapLimit(
      [...artistSpecs, ...fanSpecs],
      PROVISION_CONCURRENCY,
      ([role, n]) => provision(role, n)
    );
    const wall = performance.now() - t0;

    // Backfill ids for the ones that succeeded (listUsers once, match by email).
    const emailToRow = new Map(provisioned.filter(Boolean).map((r) => [r.email, r]));
    for (let page = 1; page <= 50; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (!data?.users?.length) break;
      for (const u of data.users) {
        const row = u.email && emailToRow.get(u.email);
        if (row) created.push({ ...row, id: u.id });
      }
      if (data.users.length < 200) break;
    }

    const provStats = stats(provisionResults.map((r) => r.ms));
    const provErrors = provisionResults.filter((r) => !r.ok);
    console.log(`  created ${created.length}/${TOTAL_USERS} in ${(wall / 1000).toFixed(1)}s ` +
      `(${(created.length / (wall / 1000)).toFixed(1)} users/s)`);
    console.log(`  per createUser: p50 ${provStats.p50}ms · p95 ${provStats.p95}ms · max ${provStats.max}ms · errors ${provErrors.length}`);
    if (provErrors.length) console.log(`  first error: ${provErrors[0].detail}`);

    const artists = created.filter((u) => u.role === "artist");
    const fans = created.filter((u) => u.role === "fan");
    if (!fans.length) throw new Error("no fans provisioned; aborting");

    // ---- Give sim artists a show so fans have something to browse/follow ----
    const { data: venue } = await admin.from("venues").select("id").limit(1).single();
    for (const artist of artists) {
      await admin.from("profiles").update({
        artist_status: "approved",
        artist_name: `Loadtest ${artist.username}`,
        stripe_account_id: `acct_LOADTEST_${runId}`,
        stripe_payouts_ready: true,
      }).eq("id", artist.id);
      const { data: ev } = await admin.from("events").insert({
        artist_id: artist.id,
        title: `LOADTEST — ${artist.username}`,
        artist_name: `Loadtest ${artist.username}`,
        venue: "Loadtest Venue",
        venue_id: venue?.id ?? null,
        city: "Madrid",
        event_date: "2027-06-01",
        event_time: "21:00",
        price: 12,
        capacity: 500,
        category: "Rock",
        active: true,
      }).select("id").single();
      if (ev) simEventIds.push(ev.id);
    }
    console.log(`  seeded ${artists.length} approved sim artists with ${simEventIds.length} shows`);

    // A pool of real+sim active events for fans to save from (browsing reality).
    const { data: evPool } = await admin
      .from("events").select("id").eq("active", true).limit(50);
    const eventPool = (evPool ?? []).map((e) => e.id);
    const artistIds = artists.map((a) => a.id);

    // ---- Phase 2: activity under load --------------------------------------
    console.log(`\n── Phase 2: fan sessions under load ──`);

    // One realistic fan session, returning per-op samples.
    async function fanSession(fan) {
      const client = createClient(URL, ANON, { auth: { persistSession: false } });
      const samples = [];
      samples.push(await timed("signIn", () =>
        client.auth.signInWithPassword({ email: fan.email, password: fan.password })));

      // Feed load = the reads a real feed render fires in parallel.
      const feed = await timed("feedLoad", () => Promise.all([
        client.from("events").select("*").eq("active", true).order("event_date"),
        client.from("content_posts").select("*").order("created_at", { ascending: false }).limit(40),
        client.from("follows").select("artist_id").eq("follower_id", fan.id),
        client.from("saved_events").select("event_id").eq("user_id", fan.id),
        client.from("notifications").select("*").eq("recipient_id", fan.id),
        client.from("tickets").select("*").eq("user_id", fan.id).is("hidden_at", null),
      ]).then((rs) => ({ error: rs.find((r) => r.error)?.error })));
      samples.push(feed);

      samples.push(await timed("exploreLoad", () => Promise.all([
        client.from("events").select("id,title,artist_name,venue,event_date,price").eq("active", true),
        client.from("venues").select("id,name,address"),
      ]).then((rs) => ({ error: rs.find((r) => r.error)?.error }))));

      // Follow a sim artist (targets only the cohort — no real-user pollution).
      if (artistIds.length) {
        const artistId = artistIds[Math.floor(Math.random() * artistIds.length)];
        samples.push(await timed("follow", () =>
          client.from("follows").insert({ follower_id: fan.id, artist_id: artistId })));
      }
      // Save a show from the live pool (cascades on teardown).
      if (eventPool.length) {
        const eventId = eventPool[Math.floor(Math.random() * eventPool.length)];
        samples.push(await timed("save", () =>
          client.from("saved_events").insert({ user_id: fan.id, event_id: eventId })));
      }
      samples.push(await timed("notifications", () =>
        client.from("notifications").select("*").eq("recipient_id", fan.id).order("created_at", { ascending: false })));

      await client.auth.signOut();
      return samples;
    }

    const perOp = {}; // op -> [ms]
    const perOpErrors = {}; // op -> count
    const record = (s) => {
      (perOp[s.op] ??= []).push(s.ms);
      if (!s.ok) perOpErrors[s.op] = (perOpErrors[s.op] ?? 0) + 1;
    };

    console.log(`\n  concurrency | sessions | p50(ms) | p95(ms) | max(ms) | errors`);
    console.log(`  ------------+----------+---------+---------+---------+-------`);
    for (const level of LEVELS.filter((l) => l <= fans.length)) {
      const sessionTimes = [];
      let errs = 0;
      for (let r = 0; r < ROUNDS; r++) {
        const batch = Array.from({ length: level }, () => fans[Math.floor(Math.random() * fans.length)]);
        const results = await Promise.all(batch.map(async (fan) => {
          const t0 = performance.now();
          const samples = await fanSession(fan);
          samples.forEach(record);
          return { ms: performance.now() - t0, failed: samples.some((s) => !s.ok) };
        }));
        results.forEach((r) => { sessionTimes.push(r.ms); if (r.failed) errs++; });
      }
      const st = stats(sessionTimes);
      console.log(`  ${String(level).padStart(11)} | ${String(st.n).padStart(8)} | ` +
        `${String(st.p50).padStart(7)} | ${String(st.p95).padStart(7)} | ${String(st.max).padStart(7)} | ${errs}`);
    }

    console.log(`\n  per-operation latency (all sessions):`);
    console.log(`  operation      | n    | p50(ms) | p95(ms) | max(ms) | errors`);
    console.log(`  ---------------+------+---------+---------+---------+-------`);
    for (const op of ["signIn", "feedLoad", "exploreLoad", "follow", "save", "notifications"]) {
      if (!perOp[op]) continue;
      const s = stats(perOp[op]);
      console.log(`  ${op.padEnd(14)} | ${String(s.n).padStart(4)} | ` +
        `${String(s.p50).padStart(7)} | ${String(s.p95).padStart(7)} | ${String(s.max).padStart(7)} | ${perOpErrors[op] ?? 0}`);
    }
  } catch (err) {
    console.error(`\nsimulation aborted: ${err.message}`);
  } finally {
    console.log(`\n── Teardown ──`);
    for (const id of simEventIds) await admin.from("events").delete().eq("id", id);
    let removed = 0;
    for (const u of created) { await admin.auth.admin.deleteUser(u.id); removed++; }
    // Belt and braces: sweep anything tagged that we didn't track.
    const swept = await sweepCohort();
    console.log(`  deleted ${removed} tracked + ${swept} swept sim account(s); removed sim shows.`);
    console.log(`\nDone.`);
  }
}

main();
