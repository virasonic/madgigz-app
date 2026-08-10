"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminClient, requireAdmin } from "@/lib/supabase/admin-queries";
import { createClient } from "@/lib/supabase/server";

// Admin "act as any user" for the testing phase. Deliberately gated behind an
// env flag that is UNSET in production, so this is inert there until someone
// turns it on - and turning it back off before launch closes the door with no
// code change. See docs/impersonation.md.
//
// The flag lives in impersonation-config (a plain module): a "use server" file
// may only export async functions, so the boolean can't be exported from here.
function impersonationEnabled() {
  return process.env.ALLOW_ADMIN_IMPERSONATION === "true";
}

// Marks the current session as an impersonation and carries the label for the
// banner. httpOnly so page JS can't read or forge it; the (app) layout reads it
// server-side to decide whether to show the "Viewing as …" bar.
const COOKIE = "mg_impersonating";

// Becomes the target user in this browser. Works by minting a one-time magic
// link for them with the service-role key and verifying it server-side, which
// swaps the session cookies - no password is ever handled, and nothing about
// the target account is changed. The admin's own session is replaced (one
// session per browser), so Exit returns to the sign-in screen rather than
// silently restoring admin - safer than stashing an admin token in a cookie.
export async function startImpersonation(targetUserId: string) {
  await requireAdmin();
  if (!impersonationEnabled()) throw new Error("Impersonation is disabled");

  const admin = adminClient();
  const { data: target, error } = await admin.auth.admin.getUserById(targetUserId);
  if (error || !target?.user?.email) throw new Error("User not found");

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: target.user.email,
  });
  if (linkError || !link?.properties?.hashed_token) {
    throw new Error("Could not create an impersonation link for this user");
  }

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyError) throw new Error(`Impersonation failed: ${verifyError.message}`);

  const { data: profile } = await admin
    .from("profiles")
    .select("username")
    .eq("id", targetUserId)
    .single();

  const store = await cookies();
  store.set(COOKIE, profile?.username ?? "user", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 4, // a testing session, not a standing login
  });

  redirect("/feed");
}

// Ends impersonation. The live session is the impersonated user (not admin), so
// this only needs to sign that session out and drop the banner cookie; the
// admin signs back in to return. Safe for anyone to call - it just logs the
// current session out.
export async function stopImpersonation() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const store = await cookies();
  store.delete(COOKIE);
  redirect("/signin");
}
