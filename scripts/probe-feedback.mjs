// Adversarial probe against the feedback table (addendum_027).
//
// Runs as an ordinary signed-in user with the anon key. Reads values back
// rather than trusting the absence of an error, for the reason documented in
// probe-artist-side.mjs.
//
//   node scripts/probe-feedback.mjs .env.local
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
function report(name, ok, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}  <-- ${detail}`);
  }
}

async function makeUser(tag) {
  const email = `probe.${tag}.${Date.now()}@madgigz-probe.invalid`;
  const password = `Probe!${Math.random().toString(36).slice(2)}Aa1`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      username: `${tag}${Date.now().toString().slice(-7)}`,
      role: "fan",
      date_of_birth: "1995-01-01",
    },
  });
  if (error) throw new Error(`${tag}: ${error.message}`);
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email, password });
  return { id: data.user.id, client };
}

const cleanup = [];
try {
  const atk = await makeUser("fbatk");
  const vic = await makeUser("fbvic");
  cleanup.push(atk.id, vic.id);

  // A genuine submission from the victim, for the attacker to try to reach.
  const { data: victimRow } = await admin
    .from("feedback")
    .insert({ user_id: vic.id, type: "support", message: "PROBE victim message" })
    .select("id")
    .single();

  console.log("Submitting:");
  {
    const { error } = await atk.client
      .from("feedback")
      .insert({ user_id: atk.id, type: "bug", message: "PROBE legit" });
    report("CAN send their own feedback", !error, error?.message ?? "");
  }
  {
    const { error } = await atk.client.from("feedback").insert({
      user_id: atk.id,
      type: "bug",
      message: "PROBE pre-resolved",
      status: "resolved",
    });
    report("cannot submit it pre-marked resolved", Boolean(error), "insert accepted");
  }
  {
    const { error } = await atk.client.from("feedback").insert({
      user_id: atk.id,
      type: "bug",
      message: "PROBE with note",
      admin_note: "handled, ignore",
    });
    report("cannot attach an admin note", Boolean(error), "insert accepted");
  }
  {
    const { error } = await atk.client
      .from("feedback")
      .insert({ user_id: vic.id, type: "bug", message: "PROBE forged sender" });
    report("cannot submit as someone else", Boolean(error), "insert accepted");
  }
  {
    const { error } = await atk.client.from("feedback").insert({ user_id: atk.id, type: "bug", message: "   " });
    report("cannot send an empty message", Boolean(error), "insert accepted");
  }

  console.log("\nReading:");
  {
    const { data } = await atk.client.from("feedback").select("id, message");
    const others = (data ?? []).filter((r) => r.message.includes("victim"));
    report("cannot read other people's feedback", others.length === 0, `${others.length} rows`);
  }
  {
    const { error } = await atk.client.from("feedback").select("contact_email").limit(1);
    report("cannot read contact emails", Boolean(error), "column returned");
  }
  {
    const { error } = await atk.client.from("feedback").select("admin_note").limit(1);
    report("cannot read internal notes", Boolean(error), "column returned");
  }

  console.log("\nTampering:");
  const readVictim = async () => {
    const { data } = await admin
      .from("feedback")
      .select("status, admin_note, message")
      .eq("id", victimRow.id)
      .single();
    return data;
  };
  {
    await atk.client.from("feedback").update({ status: "resolved" }).eq("id", victimRow.id);
    report("cannot resolve someone else's report", (await readVictim()).status === "new",
      "status changed");
  }
  {
    const { data: own } = await admin
      .from("feedback")
      .select("id")
      .eq("user_id", atk.id)
      .limit(1)
      .single();
    await atk.client.from("feedback").update({ status: "resolved" }).eq("id", own.id);
    const { data: after } = await admin
      .from("feedback")
      .select("status")
      .eq("id", own.id)
      .single();
    report("cannot resolve their OWN report either", after.status === "new", "status changed");
  }
  {
    await atk.client.from("feedback").delete().eq("id", victimRow.id);
    report("cannot delete someone else's report", (await readVictim()) !== null, "row deleted");
  }

  console.log("\nAccount deletion:");
  {
    // The whole reason user_id is ON DELETE SET NULL rather than CASCADE.
    await admin.auth.admin.deleteUser(vic.id);
    cleanup.splice(cleanup.indexOf(vic.id), 1);
    const after = await readVictim();
    report(
      "a deleted account leaves its report behind",
      after !== null && after.message === "PROBE victim message",
      "report vanished with the account"
    );
  }
} catch (err) {
  console.error("aborted:", err.message);
  fail += 1;
} finally {
  await admin.from("feedback").delete().like("message", "PROBE%");
  for (const id of cleanup) await admin.auth.admin.deleteUser(id);
  const { count } = await admin
    .from("feedback")
    .select("id", { count: "exact", head: true })
    .like("message", "PROBE%");
  console.log(`\ncleanup: ${count ?? 0} probe rows left`);
  console.log(`${pass} passed, ${fail} failed`);
}
