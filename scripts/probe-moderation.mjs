// Exercises content reports (addendum_031) as an ordinary signed-in user, then
// checks the admin-side hide with the service-role client. Creates and deletes
// its own throwaway data.
//
//   node scripts/probe-moderation.mjs .env.local
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
const admin = createClient(URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let pass = 0;
let fail = 0;
function report(name, ok, detail = "") {
  if (ok) { pass += 1; console.log(`  PASS  ${name}`); }
  else { fail += 1; console.log(`  FAIL  ${name}  <-- ${detail}`); }
}

async function makeUser(tag) {
  const email = `probe.${tag}.${Date.now()}@madgigz-probe.invalid`;
  const password = `Probe!${Math.random().toString(36).slice(2)}Aa1`;
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { username: `${tag}${Date.now().toString().slice(-6)}`, role: "fan", date_of_birth: "1995-01-01" },
  });
  if (error) throw new Error(`${tag}: ${error.message}`);
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email, password });
  return { id: data.user.id, client };
}

const cleanup = [];
let postId, eventId;
try {
  const s = Date.now().toString().slice(-7);
  const artist = await makeUser(`art${s}`);
  const fan = await makeUser(`fan${s}`);
  cleanup.push(artist.id, fan.id);
  await admin.from("profiles").update({ artist_status: "approved" }).eq("id", artist.id);

  const { data: ev } = await admin.from("events").insert({
    artist_id: artist.id, title: "PROBE mod show", artist_name: "Probe", venue: "V",
    city: "Madrid", event_date: "2027-07-07", event_time: "21:00", price: 10, capacity: 50,
    category: "Rock", active: true,
  }).select("id").single();
  eventId = ev.id;

  const { data: post } = await admin.from("content_posts").insert({
    event_id: eventId, artist_id: artist.id, artist_name: "Probe", show_title: "PROBE",
    caption: "probe post", media_url: "https://example.invalid/x.jpg", media_type: "image",
  }).select("id").single();
  postId = post.id;

  console.log("Reporting:");
  {
    const { error } = await fan.client.from("content_reports").insert({
      content_post_id: postId, reporter_id: fan.id, reason: "spam", detail: "test",
    });
    report("a fan can report a post", !error, error?.message ?? "");
  }
  {
    // Second report by same fan on same post - unique index rejects it.
    const { error } = await fan.client.from("content_reports").insert({
      content_post_id: postId, reporter_id: fan.id, reason: "hate",
    });
    report("cannot report the same post twice", error?.code === "23505", `code ${error?.code}`);
  }
  {
    const { error } = await fan.client.from("content_reports").insert({
      content_post_id: postId, reporter_id: fan.id, reason: "spam", status: "dismissed",
    });
    report("cannot file a report pre-marked dismissed", Boolean(error), "insert accepted");
  }
  {
    const { error } = await fan.client.from("content_reports").insert({
      content_post_id: postId, reporter_id: artist.id, reason: "spam",
    });
    report("cannot report as someone else", Boolean(error), "insert accepted");
  }
  {
    const { data } = await fan.client.from("content_reports").select("id, reason");
    // Can read own; cannot see anyone else's. Only own row exists here anyway.
    const { error: noteErr } = await fan.client.from("content_reports").select("admin_note").limit(1);
    report("cannot read admin notes", Boolean(noteErr), "column returned");
    report("can read own report", (data ?? []).length >= 1, "own report missing");
  }

  console.log("\nHiding (admin, service role):");
  {
    await admin.from("content_posts").update({ hidden_at: new Date().toISOString() }).eq("id", postId);
    // The public feed query filters hidden_at is null - confirm the fan no
    // longer sees it via the anon client's own read.
    const { data } = await fan.client.from("content_posts").select("id").eq("id", postId).is("hidden_at", null);
    report("a hidden post drops from the feed query", (data ?? []).length === 0, "still visible");
  }
  {
    // But an artist cannot hide their own (or anyone's) post from the browser -
    // only the service role can. addendum_026 revoked column updates; hidden_at
    // isn't in the granted set.
    await admin.from("content_posts").update({ hidden_at: null }).eq("id", postId);
    const { error } = await artist.client.from("content_posts").update({ hidden_at: new Date().toISOString() }).eq("id", postId);
    const { data: after } = await admin.from("content_posts").select("hidden_at").eq("id", postId).single();
    report("an artist cannot hide a post from the browser", after.hidden_at === null, error ? "" : "hidden_at was set");
  }
} catch (err) {
  console.error("aborted:", err.message);
  fail += 1;
} finally {
  if (postId) await admin.from("content_reports").delete().eq("content_post_id", postId);
  if (postId) await admin.from("content_posts").delete().eq("id", postId);
  if (eventId) await admin.from("events").delete().eq("id", eventId);
  for (const id of cleanup) await admin.auth.admin.deleteUser(id);
  console.log(`\n${pass} passed, ${fail} failed`);
}
