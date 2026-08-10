// Adversarial probe against the live database.
//
// Everything here runs as an ORDINARY SIGNED-IN USER holding the anon key -
// i.e. exactly what anyone can do from the browser console, since the anon key
// ships in the bundle. Nothing uses the service-role key except setup, the
// final verification reads, and teardown.
//
// Creates its own throwaway users and a throwaway event, and deletes them
// again at the end. Safe to re-run.
//
//   node scripts/security-probe.mjs .env.local
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

// "Blocked" is the expected outcome for every probe here. A probe that goes
// through is a finding, so the naming is deliberately blunt.
function report(name, blocked, detail = "") {
  if (blocked) {
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
  if (meta !== undefined) {
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw new Error(`signIn(${tag}): ${signInError.message}`);
  }
  return { id: data.user.id, email, password, client };
}

const cleanup = [];

try {
  // ---- Setup -------------------------------------------------------------
  const stamp = Date.now().toString().slice(-8);
  const attacker = await makeUser("atk", {
    username: `atk${stamp}`,
    role: "fan",
    date_of_birth: "1995-01-01",
  });
  const victim = await makeUser("vic", {
    username: `vic${stamp}`,
    role: "artist",
    date_of_birth: "1990-01-01",
  });
  cleanup.push(attacker.id, victim.id);
  console.log(`attacker ${attacker.id}\nvictim   ${victim.id}\n`);

  // Make the victim a fully approved artist with a payout account, so the
  // probes are aimed at a realistic target rather than a half-set-up account.
  await admin
    .from("profiles")
    .update({
      artist_status: "approved",
      artist_name: "Probe Victim",
      stripe_account_id: "acct_PROBE_VICTIM",
      stripe_payouts_ready: true,
    })
    .eq("id", victim.id);

  const { data: venue } = await admin.from("venues").select("id").limit(1).single();
  const { data: victimEvent, error: eventError } = await admin
    .from("events")
    .insert({
      artist_id: victim.id,
      title: "PROBE - victim show",
      artist_name: "Probe Victim",
      venue: "Probe Venue",
      venue_id: venue?.id ?? null,
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

  // ---- 1. Profile escalation (addendum_024) ------------------------------
  console.log("1. Editing your own profile");
  for (const [label, patch] of [
    ["cannot self-promote to artist", { role: "artist" }],
    ["cannot self-approve artist status", { artist_status: "approved" }],
    ["cannot rewrite date of birth (16+ gate)", { date_of_birth: "2020-01-01" }],
    ["cannot set own stripe account", { stripe_account_id: "acct_ATTACKER" }],
    ["cannot flag own payouts ready", { stripe_payouts_ready: true }],
    ["cannot inflate own follower count", { follower_count: 99999 }],
    ["cannot change own username (bypassing [[89]])", { username: `hijack${stamp}` }],
    ["cannot cancel own pending deletion", { deletion_requested_at: null }],
  ]) {
    const { error } = await A.from("profiles").update(patch).eq("id", attacker.id);
    report(label, Boolean(error), error ? "" : "update succeeded");
  }

  // ---- 2. Other people's profiles ----------------------------------------
  console.log("\n2. Editing someone else's profile");
  {
    const { error, count } = await A.from("profiles")
      .update({ artist_bio: "defaced" }, { count: "exact" })
      .eq("id", victim.id);
    report("cannot edit another artist's bio", Boolean(error) || count === 0, "row was updated");
  }

  // ---- 3. Private columns still private (addendum_018 regression) --------
  console.log("\n3. Reading private columns");
  for (const column of ["date_of_birth", "stripe_account_id"]) {
    const { error } = await A.from("profiles").select(column).limit(1);
    report(`cannot read ${column}`, Boolean(error), "column was returned");
  }
  {
    // Filtering on an ungranted column is the sneaky version: no column is
    // returned, but yes/no answers leak the value one query at a time.
    const { error } = await A.from("profiles").select("id").lt("date_of_birth", "2010-01-01");
    report("cannot filter on date_of_birth", Boolean(error), "filter was accepted");
  }

  // ---- 4. Tickets and money ----------------------------------------------
  console.log("\n4. Tickets");
  {
    const { error } = await A.from("tickets").insert({
      user_id: attacker.id,
      event_id: victimEvent.id,
      quantity: 1,
      price_paid: 0,
    });
    report("cannot mint a free ticket", Boolean(error), "ticket inserted");
  }
  // An UPDATE that matches no rows returns no error, so "did it error?" is not
  // a security test - the first version of this probe reported two false
  // failures that way. Give the attacker a real ticket and read the row back.
  {
    const { data: ownTicket } = await admin
      .from("tickets")
      .insert({
        user_id: attacker.id,
        event_id: victimEvent.id,
        quantity: 1,
        price_paid: 15,
        checked_in_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    const readBack = async () => {
      const { data } = await admin
        .from("tickets")
        .select("checked_in_at, refunded, quantity, price_paid")
        .eq("id", ownTicket.id)
        .single();
      return data;
    };

    await A.from("tickets").update({ checked_in_at: null }).eq("id", ownTicket.id);
    report(
      "cannot un-check-in their own ticket to reuse it",
      (await readBack()).checked_in_at !== null,
      "checked_in_at was cleared"
    );

    await A.from("tickets").update({ refunded: true }).eq("id", ownTicket.id);
    report("cannot mark their own ticket refunded", (await readBack()).refunded === false,
      "refunded was set");

    await A.from("tickets").update({ quantity: 99 }).eq("id", ownTicket.id);
    report("cannot inflate their own ticket quantity", (await readBack()).quantity === 1,
      "quantity changed");

    await A.from("tickets").update({ price_paid: 0 }).eq("id", ownTicket.id);
    report("cannot rewrite what they paid", Number((await readBack()).price_paid) === 15,
      "price_paid changed");

    await admin.from("tickets").delete().eq("id", ownTicket.id);
  }
  {
    const { data } = await A.from("tickets").select("id, user_id").neq("user_id", attacker.id);
    report("cannot read other people's tickets", (data ?? []).length === 0, `${data?.length} rows`);
  }

  // ---- 5. Events ----------------------------------------------------------
  console.log("\n5. Events");
  {
    const { error } = await A.from("events").insert({
      artist_id: attacker.id,
      title: "PROBE - unapproved fan show",
      artist_name: "Attacker",
      venue: "Nowhere",
      city: "Madrid",
      event_date: "2027-02-02",
      event_time: "20:00",
      price: 10,
      capacity: 50,
      category: "Rock",
    });
    report("unapproved fan cannot publish a show", Boolean(error), "event inserted");
  }
  {
    const { error, count } = await A.from("events")
      .update({ price: 0 }, { count: "exact" })
      .eq("id", victimEvent.id);
    report(
      "cannot re-price someone else's show",
      Boolean(error) || count === 0,
      "price was changed"
    );
  }
  {
    const { error, count } = await A.from("events")
      .update({ sold: 0 }, { count: "exact" })
      .eq("id", victimEvent.id);
    report("cannot reset someone else's sold count", Boolean(error) || count === 0, "sold changed");
  }
  {
    const { error, count } = await A.from("events")
      .delete({ count: "exact" })
      .eq("id", victimEvent.id);
    report("cannot delete someone else's show", Boolean(error) || count === 0, "event deleted");
  }

  // ---- 6. Impersonation via tagging --------------------------------------
  console.log("\n6. Line-up tagging");
  {
    const { error } = await A.from("event_artists").insert({
      event_id: victimEvent.id,
      profile_id: attacker.id,
    });
    report("cannot add self to someone else's line-up", Boolean(error), "tag inserted");
  }
  {
    const { error } = await A.from("content_posts").insert({
      event_id: victimEvent.id,
      artist_id: attacker.id,
      caption: "probe",
      media_url: "https://example.invalid/x.jpg",
      media_type: "image",
    });
    report("cannot post content to someone else's show", Boolean(error), "post inserted");
  }

  // ---- 7. Social graph ----------------------------------------------------
  console.log("\n7. Follows and notifications");
  {
    const { error } = await A.from("follows").insert({
      follower_id: victim.id,
      artist_id: attacker.id,
    });
    report("cannot make someone else follow you", Boolean(error), "follow inserted");
  }
  {
    const { error } = await A.from("notifications").insert({
      recipient_id: victim.id,
      type: "new_follower",
      actor_id: attacker.id,
    });
    report("cannot send someone a fake notification", Boolean(error), "notification inserted");
  }
  {
    const { data } = await A.from("notifications").select("id").neq("recipient_id", attacker.id);
    report(
      "cannot read other people's notifications",
      (data ?? []).length === 0,
      `${data?.length} rows`
    );
  }

  // ---- 8. Discounts -------------------------------------------------------
  console.log("\n8. Discounts");
  {
    const { error } = await A.from("discounts").insert({
      code: `PROBE${stamp}`,
      discount_type: "percent",
      value: 100,
      active: true,
    });
    report("cannot invent a 100% discount code", Boolean(error), "discount inserted");
  }
  {
    const { data, error } = await A.from("discounts").select("code, value");
    report(
      "cannot enumerate every discount code",
      Boolean(error) || (data ?? []).length === 0,
      `${data?.length} codes readable`
    );
  }

  // ---- 9. Artist evidence (addendum_015) ---------------------------------
  console.log("\n9. Artist evidence");
  {
    const { data, error } = await A.from("artist_evidence").select("profile_id, storage_path");
    const leaked = (data ?? []).filter((r) => r.profile_id !== attacker.id);
    report("cannot read others' verification evidence", Boolean(error) || leaked.length === 0,
      `${leaked.length} rows`);
  }

  // ---- 10. Reference data -------------------------------------------------
  console.log("\n10. Reference data");
  {
    const { error } = await A.from("venues").insert({ name: `PROBE ${stamp}`, city: "Madrid" });
    report("cannot invent a venue", Boolean(error), "venue inserted");
  }
  {
    const { error, count } = await A.from("venues")
      .update({ verified: true }, { count: "exact" })
      .eq("id", venue?.id);
    report("cannot self-verify a venue", Boolean(error) || count === 0, "venue updated");
  }

  // ---- 11. The onboarding RPC (addendum_025) ------------------------------
  console.log("\n11. complete_onboarding(), the one door that sets role");
  {
    // The attacker's profile is already complete (created with metadata), so
    // this is the "second bite" case - the exact thing that would turn the RPC
    // into a permanent role-change bypass.
    const { data } = await A.rpc("complete_onboarding", {
      p_username: `sneak${stamp}`,
      p_role: "artist",
      p_date_of_birth: "1990-01-01",
    });
    report("cannot re-run it to become an artist", data === "already_complete", `returned ${data}`);
  }

  // A fresh OAuth-shaped account: created with NO user metadata, exactly as a
  // Google callback arrives.
  const oauth = await makeUser("oauth", undefined);
  cleanup.push(oauth.id);
  const { data: oauthProfile } = await admin
    .from("profiles")
    .select("username, role, date_of_birth, onboarding_complete")
    .eq("id", oauth.id)
    .single();
  console.log("  OAuth-shaped profile created by the trigger:", oauthProfile);
  report(
    "OAuth signup lands as incomplete",
    oauthProfile?.onboarding_complete === false,
    "marked complete"
  );
  report(
    "OAuth signup has a valid placeholder username",
    /^[A-Za-z0-9._-]{3,30}$/.test(oauthProfile?.username ?? ""),
    `got "${oauthProfile?.username}"`
  );

  // Sign that one in so it can call the RPC as itself.
  const oauthClient = createClient(URL, ANON, { auth: { persistSession: false } });
  await oauthClient.auth.signInWithPassword({ email: oauth.email, password: oauth.password });

  {
    const { error } = await oauthClient
      .from("profiles")
      .update({ role: "artist", date_of_birth: "2015-01-01", onboarding_complete: true })
      .eq("id", oauth.id);
    report("incomplete account cannot self-complete by UPDATE", Boolean(error), "update accepted");
  }
  {
    const { data } = await oauthClient.rpc("complete_onboarding", {
      p_username: `kid${stamp}`,
      p_role: "fan",
      p_date_of_birth: "2015-06-01",
    });
    report("16+ gate holds server-side", data === "too_young", `returned ${data}`);
  }
  {
    const { data } = await oauthClient.rpc("complete_onboarding", {
      p_username: `atk${stamp}`,
      p_role: "fan",
      p_date_of_birth: "1995-01-01",
    });
    report("cannot claim a taken username", data === "username_taken", `returned ${data}`);
  }
  {
    const { data } = await oauthClient.rpc("complete_onboarding", {
      p_username: "no spaces!",
      p_role: "fan",
      p_date_of_birth: "1995-01-01",
    });
    report("username format enforced", data === "username_invalid", `returned ${data}`);
  }
  {
    const { data } = await oauthClient.rpc("complete_onboarding", {
      p_username: `good${stamp}`,
      p_role: "artist",
      p_date_of_birth: "1995-01-01",
    });
    report("a legitimate completion succeeds", data === "ok", `returned ${data}`);
  }
  {
    const { data: after } = await admin
      .from("profiles")
      .select("username, role, artist_status, date_of_birth, onboarding_complete")
      .eq("id", oauth.id)
      .single();
    console.log("  after completion:", after);
    report(
      "artist via Google still lands in the review queue",
      after?.artist_status === "pending",
      `status ${after?.artist_status}`
    );
    report("completion is single-use", after?.onboarding_complete === true, "still incomplete");
  }
  {
    const { data } = await oauthClient.rpc("complete_onboarding", {
      p_username: `again${stamp}`,
      p_role: "fan",
      p_date_of_birth: "1995-01-01",
    });
    report("cannot re-run after completing", data === "already_complete", `returned ${data}`);
  }

  // ---- Teardown -----------------------------------------------------------
  await admin.from("events").delete().eq("id", victimEvent.id);
} catch (err) {
  console.error("\nprobe aborted:", err.message);
  fail += 1;
} finally {
  await admin.from("events").delete().like("title", "PROBE - %");
  for (const id of cleanup) await admin.auth.admin.deleteUser(id);
  console.log(`\ncleaned up ${cleanup.length} probe accounts`);
  console.log(`\n${pass} passed, ${fail} failed`);
  if (failures.length) console.log("FAILED:\n - " + failures.join("\n - "));
}
