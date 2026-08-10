"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Lets a fan opt into becoming an artist. It only moves them into the review
// queue - role artist, status pending - and drops them on the same claim form a
// new artist fills. It does NOT approve them; an admin still verifies the
// evidence, exactly like a fresh artist signup. Selling tickets stays gated on
// approval + a payout account.
//
// The role flip is done with the service-role client because RLS deliberately
// forbids a client from changing its own role (see security-probe.mjs). The
// guard here is what keeps that safe: only a caller whose current role is 'fan'
// can run it, and the only reachable target state is 'pending'.
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

  // Only a fan upgrades. An artist (pending or approved) or an admin has no
  // business here, and flipping an approved artist back to pending would be a
  // downgrade - so anyone who isn't a fan just goes to their profile.
  if (profile?.role !== "fan") redirect("/profile");

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ role: "artist", artist_status: "pending" })
    .eq("id", user.id);
  if (error) throw new Error(`Could not switch to an artist account: ${error.message}`);

  // The claim form (guarded to pending artists) collects name, socials and
  // evidence and puts them in front of the admin queue.
  redirect("/signup/artist-profile");
}
