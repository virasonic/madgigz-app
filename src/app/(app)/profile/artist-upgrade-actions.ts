"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Lets a fan opt into becoming an artist. It puts them in the review queue -
// artist_status pending - and drops them on the same claim form a new artist
// fills. It does NOT approve them, and (#209) it no longer makes them an artist
// either: the ROLE follows approval, not application.
//
// That used to be the other way round, and rejection never put it back, so a
// turned-down applicant was stranded as an "artist" forever - no artist tools,
// because those gate on approval, and no fan profile either, because the saved
// and attended walls are fan-only. Five real accounts were sitting in that state
// on prod. An application is now just a flag on a fan.
//
// Nothing loosens: RLS keys on artist_status = 'approved', never on role, so a
// pending applicant could never insert an event under either model.
//
// Written with the service-role client because RLS deliberately forbids a client
// changing its own role or status (see security-probe.mjs). The guard here is
// what keeps that safe: only a caller whose current role is 'fan' can run it,
// and the only reachable target state is 'pending'.
export async function startArtistUpgrade() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  // Only a fan applies. An approved artist or an admin has no business here, and
  // flipping an approved artist back to pending would be a downgrade - so anyone
  // who isn't a fan just goes to their profile. A fan who was turned down before
  // IS allowed through: re-applying with better evidence is exactly what the
  // rejection email tells them to do.
  if (profile?.role !== "fan") redirect("/profile");

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ artist_status: "pending" })
    .eq("id", user.id);
  if (error) throw new Error(`Could not switch to an artist account: ${error.message}`);

  // The claim form (guarded to pending artists) collects name, socials and
  // evidence and puts them in front of the admin queue.
  redirect("/signup/artist-profile");
}

// The escape hatch from the claim form: someone who tapped "I'm an artist" by
// mistake withdraws the application and goes back to the feed. Only a NOT-yet-
// approved applicant can do this — an approved artist keeps their status (this
// must never quietly strip a real artist's approval), and someone with no
// application has nothing to undo. Service-role for the same reason as
// startArtistUpgrade: RLS forbids a client changing its own role or status; the
// session-derived guard here is the control.
//
// Still writes role as well as status, because rows predating #209 (and its
// backfill) can be sitting at role 'artist' with a pending application.
export async function switchToFan() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, artist_status")
    .eq("id", user.id)
    .single();

  // Anything short of approved is withdrawable; approved never is. Covers both
  // shapes: a fan with a pending application (now), and the legacy artist row.
  const pendingApplication =
    profile?.artist_status === "pending" || profile?.artist_status === "rejected";
  if (!pendingApplication || profile?.role === "admin") redirect("/feed");

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ role: "fan", artist_status: null })
    .eq("id", user.id);
  if (error) throw new Error(`Could not switch to a fan account: ${error.message}`);

  redirect("/feed");
}
