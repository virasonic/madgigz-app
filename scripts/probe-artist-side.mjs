// What an ARTIST can do, as opposed to security-probe.mjs's fan.
//
// Artists are the interesting case because they are the only non-admin role
// with UPDATE policies on tickets and events, and an approved artist is a
// stranger who filled in a form - not someone trusted with the till.
//
// Every check reads the stored value back afterwards rather than asking
// whether PostgREST returned an error. An update matching zero rows returns no
// error, so "did it error?" reports a locked door as a hole and vice versa -
// which is exactly the false positive the first version of this probe produced.
//
//   node scripts/probe-artist-side.mjs .env.local
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

async function makeUser(tag, meta) {
  const email = `probe.${tag}.${Date.now()}@madgigz-probe.invalid`;
  const password = `Probe!${Math.random().toString(36).slice(2)}Aa1`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: meta,
  });
  if (error) throw new Error(`${tag}: ${error.message}`);
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email, password });
  return { id: data.user.id, client };
}

const cleanup = [];
let eventId;

try {
  const stamp = Date.now().toString().slice(-8);
  const fan = await makeUser("fan", { username: `fan${stamp}`, role: "fan", date_of_birth: "1995-01-01" });
  const artist = await makeUser("art", { username: `art${stamp}`, role: "artist", date_of_birth: "1990-01-01" });
  const other = await makeUser("oth", { username: `oth${stamp}`, role: "artist", date_of_birth: "1990-01-01" });
  cleanup.push(fan.id, artist.id, other.id);

  await admin
    .from("profiles")
    .update({ artist_status: "approved" })
    .in("id", [artist.id, other.id]);

  const { data: ev, error: evErr } = await admin
    .from("events")
    .insert({
      artist_id: artist.id,
      title: "PROBE - ticket test",
      artist_name: "Probe Artist",
      venue: "Probe Venue",
      city: "Madrid",
      event_date: "2027-03-03",
      event_time: "21:00",
      price: 15,
      capacity: 100,
      category: "Rock",
      active: true,
    })
    .select("id")
    .single();
  if (evErr) throw new Error(`event: ${evErr.message}`);
  eventId = ev.id;

  // A real, scanned, unrefunded ticket belonging to the fan.
  const { data: ticket, error: tErr } = await admin
    .from("tickets")
    .insert({
      user_id: fan.id,
      event_id: eventId,
      quantity: 1,
      price_paid: 15,
      checked_in_at: new Date().toISOString(),
      refunded: false,
    })
    .select("id")
    .single();
  if (tErr) throw new Error(`ticket: ${tErr.message}`);

  const read = async () => {
    const { data } = await admin
      .from("tickets")
      .select("checked_in_at, refunded, quantity, price_paid, user_id")
      .eq("id", ticket.id)
      .single();
    return data;
  };

  console.log("The ticket holder, editing their own ticket:");
  {
    await fan.client.from("tickets").update({ checked_in_at: null }).eq("id", ticket.id);
    const after = await read();
    report(
      "cannot un-check-in to reuse it at the door",
      after.checked_in_at !== null,
      "checked_in_at was cleared"
    );
  }
  {
    await fan.client.from("tickets").update({ refunded: true }).eq("id", ticket.id);
    const after = await read();
    report("cannot mark it refunded", after.refunded === false, "refunded was set");
  }
  {
    await fan.client.from("tickets").update({ quantity: 99 }).eq("id", ticket.id);
    const after = await read();
    report("cannot inflate the quantity", after.quantity === 1, `quantity became ${after.quantity}`);
  }
  {
    await fan.client.from("tickets").update({ price_paid: 0 }).eq("id", ticket.id);
    const after = await read();
    report("cannot rewrite what they paid", Number(after.price_paid) === 15, `price ${after.price_paid}`);
  }

  console.log("\nA different artist, editing someone else's event's tickets:");
  {
    await other.client.from("tickets").update({ checked_in_at: null }).eq("id", ticket.id);
    const after = await read();
    report("cannot un-check-in it", after.checked_in_at !== null, "checked_in_at was cleared");
  }
  {
    await other.client.from("tickets").update({ user_id: other.id }).eq("id", ticket.id);
    const after = await read();
    report("cannot steal the ticket", after.user_id === fan.id, "user_id was reassigned");
  }

  console.log("\nThe event's own artist (the scanner path that must work):");
  {
    await admin.from("tickets").update({ checked_in_at: null }).eq("id", ticket.id);
    const { error } = await artist.client
      .from("tickets")
      .update({ checked_in_at: new Date().toISOString() })
      .eq("id", ticket.id);
    const after = await read();
    report(
      "CAN check in a ticket for their own show",
      !error && after.checked_in_at !== null,
      error?.message ?? "checked_in_at stayed null"
    );
  }
  {
    await artist.client.from("tickets").update({ refunded: true }).eq("id", ticket.id);
    const after = await read();
    report(
      "cannot mark their own show's ticket refunded",
      after.refunded === false,
      "artist set refunded"
    );
  }
  {
    await artist.client.from("tickets").update({ price_paid: 999 }).eq("id", ticket.id);
    const after = await read();
    report(
      "cannot rewrite what a fan paid",
      Number(after.price_paid) === 15,
      `price became ${after.price_paid}`
    );
  }

  console.log("\nThe event's own artist, editing their own show:");
  const readEvent = async () => {
    const { data } = await admin
      .from("events")
      .select("sold, capacity, house_run, cancelled, artist_id")
      .eq("id", eventId)
      .single();
    return data;
  };
  {
    // sold is not a display counter - addendum_006 made it the atomic capacity
    // reservation, so zeroing it re-opens a venue that is already full.
    await admin.from("events").update({ sold: 100, capacity: 100 }).eq("id", eventId);
    await artist.client.from("events").update({ sold: 0 }).eq("id", eventId);
    const after = await readEvent();
    report("cannot reset sold to oversell the room", after.sold === 100, `sold became ${after.sold}`);
  }
  {
    await artist.client.from("events").update({ house_run: true }).eq("id", eventId);
    const after = await readEvent();
    report(
      "cannot flip their show to house-run (money path)",
      after.house_run === false,
      "house_run was set"
    );
  }
  {
    await artist.client.from("events").update({ cancelled: true }).eq("id", eventId);
    const after = await readEvent();
    report(
      "cannot mark a show cancelled without the refund path",
      after.cancelled === false,
      "cancelled was set"
    );
  }
  {
    await artist.client.from("events").update({ artist_id: other.id }).eq("id", eventId);
    const after = await readEvent();
    report("cannot hand their show to someone else", after.artist_id === artist.id, "owner changed");
  }
  {
    // Must still work: hiding a show is the one event write the browser makes.
    await artist.client.from("events").update({ active: false }).eq("id", eventId);
    const { data: hidden } = await admin
      .from("events")
      .select("active")
      .eq("id", eventId)
      .single();
    report("CAN still hide their own show", hidden.active === false, "visibility toggle broke");
  }
  {
    const { error } = await artist.client.from("events").insert({
      artist_id: artist.id,
      title: "PROBE - sneaky insert",
      artist_name: "Probe Artist",
      venue: "V",
      city: "Madrid",
      event_date: "2027-05-05",
      event_time: "21:00",
      price: 15,
      capacity: 10,
      category: "Rock",
      house_run: true,
    });
    report("cannot create a show that is house-run", Boolean(error), "insert accepted");
  }

  await admin.from("tickets").delete().eq("id", ticket.id);
} catch (err) {
  console.error("aborted:", err.message);
  fail += 1;
} finally {
  if (eventId) {
    await admin.from("tickets").delete().eq("event_id", eventId);
    await admin.from("events").delete().eq("id", eventId);
  }
  for (const id of cleanup) await admin.auth.admin.deleteUser(id);
  console.log(`\n${pass} passed, ${fail} failed`);
}
