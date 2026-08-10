// Exercises the username-change and username-sign-in machinery (addendum_030)
// as an ordinary signed-in user, then checks the results with the admin client.
// Creates and deletes its own throwaway accounts.
//
//   node scripts/probe-username.mjs .env.local
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
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${name}  <-- ${detail}`);
  }
}

async function makeUser(username) {
  const email = `probe.${username}@madgigz-probe.invalid`;
  const password = `Probe!${Math.random().toString(36).slice(2)}Aa1`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username, role: "fan", date_of_birth: "1995-01-01" },
  });
  if (error) throw new Error(`${username}: ${error.message}`);
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email, password });
  return { id: data.user.id, email, client };
}

const cleanup = [];
try {
  const s = Date.now().toString().slice(-7);
  const a = await makeUser(`aa${s}`);
  const b = await makeUser(`bb${s}`);
  cleanup.push(a.id, b.id);
  const oldName = `aa${s}`;
  const newName = `az${s}`;

  console.log("Changing your own username:");
  {
    const { data } = await a.client.rpc("change_username", { p_new: newName });
    report("a legitimate rename succeeds", data === "ok", `returned ${data}`);
  }
  {
    const { data } = await admin.from("profiles").select("username").eq("id", a.id).single();
    report("the new name is live", data.username === newName, `is ${data.username}`);
  }
  {
    const { data } = await admin
      .from("username_history")
      .select("old_username")
      .eq("profile_id", a.id);
    report(
      "the old name is recorded in history",
      (data ?? []).some((r) => r.old_username === oldName),
      "not recorded"
    );
  }

  console.log("\nThe released name is on cooldown for others:");
  {
    // b (a different user) cannot take a's just-released name.
    const { data } = await b.client.rpc("username_available", { candidate: oldName });
    report("someone else sees the old name as unavailable", data === false, `returned ${data}`);
  }
  {
    const { data } = await b.client.rpc("change_username", { p_new: oldName });
    report("someone else cannot claim it", data === "taken", `returned ${data}`);
  }
  {
    // a can reclaim their own released name.
    const { data } = await a.client.rpc("username_available", { candidate: oldName });
    report("but the releaser can reclaim their own", data === true, `returned ${data}`);
  }

  console.log("\nRules still hold:");
  {
    const { data } = await a.client.rpc("change_username", { p_new: `bb${s}` });
    report("cannot take a name someone currently holds", data === "taken", `returned ${data}`);
  }
  {
    const { data } = await a.client.rpc("change_username", { p_new: "no spaces!" });
    report("format is enforced", data === "invalid", `returned ${data}`);
  }
  {
    const { data } = await a.client.rpc("change_username", { p_new: "AZ" + s });
    // Same lower() as current newName? no - newName is az..., "AZ"+s differs
    // only if same letters; here it's a case variant of the live name, allowed.
    report("a pure case change is allowed", data === "ok", `returned ${data}`);
  }

  console.log("\nSign-in lookup is server-only:");
  {
    // The whole point of #91: email_for_username must be unreachable from a
    // signed-in browser client, or it becomes an email-harvesting endpoint.
    const { error } = await a.client.rpc("email_for_username", { candidate: newName });
    report("email_for_username is denied to the browser", Boolean(error), "it was callable!");
  }
  {
    // ...but the server (service role) can resolve it.
    const { data } = await admin.rpc("email_for_username", { candidate: newName });
    report("the server can resolve username -> email", data === a.email, `got ${data}`);
  }
  {
    const { data } = await admin.rpc("email_for_username", { candidate: `nobody${s}` });
    report("an unknown username resolves to nothing", data === null, `got ${data}`);
  }
} catch (err) {
  console.error("aborted:", err.message);
  fail += 1;
} finally {
  for (const id of cleanup) await admin.auth.admin.deleteUser(id);
  console.log(`\n${pass} passed, ${fail} failed`);
}
