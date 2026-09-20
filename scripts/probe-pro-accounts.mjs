// Adversarial probe for the pro-account surface (#88, addendum_051).
//
// Everything here runs as an ORDINARY SIGNED-IN USER holding the anon key -
// i.e. exactly what anyone can do from the browser console, since the anon key
// ships in the bundle. Nothing uses the service-role key except setup, the
// final verification reads, and teardown.
//
// Why this one exists: addendum_051 adds BOTH a row policy and a column grant,
// which is the exact pairing CLAUDE.md warns about - a row policy hands over the
// whole row, so `created_by` is only hidden if the GRANT says so. It also adds
// events.pro_account_id, which must NOT be in the column list addendum_026
// grants to authenticated, or any approved artist could quietly assign their own
// show to a promoter's payout account.
//
// Every write probe reads the stored value back afterwards. An UPDATE matching
// zero rows returns no error, so "did it error?" alone reports a locked door as
// a hole.
//
// Creates its own throwaway users, pro account and event, and deletes them
// again. Safe to re-run.
//
//   node scripts/probe-pro-accounts.mjs .env.staging
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(process.argv[2] ?? ".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])
);

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let pass = 0;
let fail = 0;
const failures = [];

function report(name, ok, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    failures.push(name);
    console.log(`  FAIL  ${name}  <-- ${detail}`);
  }
}

async function makeUser(tag, meta) {
  const email = `probe.${tag}.${Date.now()}@madgigz-probe.invalid`;
  const password = `Probe!${Math.random().toString(36).slice(2)}Aa1`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: meta,
  });
  if (error) throw new Error(`createUser(${tag}): ${error.message}`);
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`signIn(${tag}): ${signInError.message}`);
  return { id: data.user.id, email, password, client };
}

const cleanup = [];
// Teardown deletes by a PROBE- name prefix, which is only ever meaningful once
// this run has actually seeded something. Guarded so that aborting early (wrong
// database, addendum not run) doesn't fire a delete at a database this probe
// never touched.
let seeded = false;

try {
  console.log(`probing ${URL}\n`);

  // Fail loudly rather than reporting a clean sheet on a database where the
  // table simply isn't there - "nothing leaked" and "nothing exists" must not
  // look the same in a security probe.
  const { error: presenceError } = await admin.from("pro_accounts").select("id").limit(1);
  if (presenceError) {
    throw new Error(
      `pro_accounts is not on this database (${presenceError.code}). Run addendum_051 first.`
    );
  }

  // ---- Setup -------------------------------------------------------------
  const stamp = Date.now().toString().slice(-8);
  const attacker = await makeUser("atk", {
    username: `atk${stamp}`,
    role: "fan",
    date_of_birth: "1995-01-01",
  });
  const promoter = await makeUser("pro", {
    username: `pro${stamp}`,
    role: "fan",
    date_of_birth: "1990-01-01",
  });
  cleanup.push(attacker.id, promoter.id);
  console.log(`attacker ${attacker.id}\npromoter ${promoter.id}\n`);

  const { error: proError } = await admin.from("pro_accounts").insert({
    id: promoter.id,
    type: "promoter",
    display_name: "PROBE - Promoter",
    active: true,
  });
  if (proError) throw new Error(`seed pro account: ${proError.message}`);

  seeded = true;
  const { data: promoterEvent, error: eventError } = await admin
    .from("events")
    .insert({
      artist_id: null,
      pro_account_id: promoter.id,
      title: "PROBE - promoter show",
      artist_name: "Probe Act",
      venue: "Probe Venue",
      city: "Madrid",
      event_date: "2027-01-01",
      event_time: "21:00",
      price: 15,
      capacity: 100,
      category: "Rock",
      active: true,
    })
    .select("id")
    .single();
  if (eventError) throw new Error(`seed event: ${eventError.message}`);

  const A = attacker.client;
  const P = promoter.client;
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });

  // ---- 1. Reading somebody else's pro account ----------------------------
  console.log("1. Reading pro_accounts");
  {
    const { data } = await A.from("pro_accounts").select("id, display_name").eq("id", promoter.id);
    report("a fan cannot read another account's pro row", (data ?? []).length === 0, JSON.stringify(data));
  }
  {
    const { data } = await A.from("pro_accounts").select("id, display_name");
    report("a fan cannot list pro accounts", (data ?? []).length === 0, `${(data ?? []).length} rows`);
  }
  {
    const { data } = await anon.from("pro_accounts").select("id, display_name");
    report("a logged-out visitor cannot list pro accounts", (data ?? []).length === 0, `${(data ?? []).length} rows`);
  }
  {
    // The one thing that IS meant to work: the app shell asks "am I a pro?".
    const { data } = await P.from("pro_accounts").select("id, type, display_name, active").eq("id", promoter.id).maybeSingle();
    report("a pro CAN read their own row", data?.type === "promoter", JSON.stringify(data));
  }

  // ---- 2. The ungranted columns (RLS does not hide columns) --------------
  console.log("\n2. Columns deliberately left out of the grant");
  for (const column of ["created_by", "created_at"]) {
    const { data, error } = await P.from("pro_accounts").select(column).eq("id", promoter.id);
    report(
      `a pro cannot read their own ${column}`,
      Boolean(error) || (data ?? []).length === 0,
      `got ${JSON.stringify(data)}`
    );
  }

  // ---- 3. Making yourself a promoter -------------------------------------
  console.log("\n3. Writing to pro_accounts");
  {
    await A.from("pro_accounts").insert({
      id: attacker.id,
      type: "promoter",
      display_name: "Self-appointed",
      active: true,
    });
    const { data } = await admin.from("pro_accounts").select("id").eq("id", attacker.id).maybeSingle();
    report("a fan cannot make themselves a promoter", !data, "a pro_accounts row was created");
  }
  {
    await P.from("pro_accounts").update({ display_name: "Renamed by owner" }).eq("id", promoter.id);
    const { data } = await admin.from("pro_accounts").select("display_name").eq("id", promoter.id).single();
    report(
      "a pro cannot rename their own business",
      data?.display_name === "PROBE - Promoter",
      `name is now ${data?.display_name}`
    );
  }
  {
    // The deactivation path has to be one-way from the account holder's side,
    // or switching a promoter off would be a suggestion rather than a control.
    await admin.from("pro_accounts").update({ active: false }).eq("id", promoter.id);
    await P.from("pro_accounts").update({ active: true }).eq("id", promoter.id);
    const { data } = await admin.from("pro_accounts").select("active").eq("id", promoter.id).single();
    report("a deactivated pro cannot switch themselves back on", data?.active === false, "re-activated itself");
    await admin.from("pro_accounts").update({ active: true }).eq("id", promoter.id);
  }
  {
    await A.from("pro_accounts").delete().eq("id", promoter.id);
    const { data } = await admin.from("pro_accounts").select("id").eq("id", promoter.id).maybeSingle();
    report("a fan cannot delete a pro account", Boolean(data), "the row was deleted");
  }

  // ---- 4. Hijacking the payout destination -------------------------------
  // events.pro_account_id decides who Stripe pays. addendum_026 grants an
  // explicit column list for insert/update on events, and this column is not on
  // it - so this is the probe that the grant list wasn't quietly widened.
  console.log("\n4. events.pro_account_id (who gets paid)");
  {
    await A.from("events").update({ pro_account_id: attacker.id }).eq("id", promoterEvent.id);
    const { data } = await admin.from("events").select("pro_account_id").eq("id", promoterEvent.id).single();
    report(
      "a fan cannot redirect a show's payout to themselves",
      data?.pro_account_id === promoter.id,
      `pro_account_id is now ${data?.pro_account_id}`
    );
  }
  {
    await P.from("events").update({ price: 1 }).eq("id", promoterEvent.id);
    const { data } = await admin.from("events").select("price").eq("id", promoterEvent.id).single();
    report(
      "a pro cannot reprice their show through the anon key",
      Number(data?.price) === 15,
      `price is now ${data?.price}`
    );
  }
  {
    // The panel writes through the service-role client, so the account itself
    // needs no direct insert rights on events at all.
    await P.from("events").insert({
      artist_id: null,
      pro_account_id: promoter.id,
      title: "PROBE - direct insert",
      artist_name: "Probe Act",
      venue: "Probe Venue",
      city: "Madrid",
      event_date: "2027-01-02",
      event_time: "21:00",
      price: 10,
      capacity: 50,
      category: "Rock",
      active: true,
    });
    const { data } = await admin.from("events").select("id").eq("title", "PROBE - direct insert");
    report("a pro cannot insert a show straight into the table", (data ?? []).length === 0, "an event was created");
  }

  // ---- Teardown -----------------------------------------------------------
  await admin.from("events").delete().eq("id", promoterEvent.id);
} catch (err) {
  console.error("\nprobe aborted:", err.message);
  fail += 1;
} finally {
  if (seeded) {
    await admin.from("events").delete().like("title", "PROBE - %");
    await admin.from("pro_accounts").delete().like("display_name", "PROBE - %");
  }
  for (const id of cleanup) await admin.auth.admin.deleteUser(id);
  console.log(`\ncleaned up ${cleanup.length} probe accounts`);
  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) console.log("FAILED:\n - " + failures.join("\n - "));
  process.exit(fail > 0 ? 1 : 0);
}
