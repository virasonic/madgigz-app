"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelDeletionOnSignIn } from "@/app/(app)/profile/account-actions";
import { safeNext } from "@/lib/site";

// One sign-in path for both an email and a username (#91). It must be a server
// action, not a browser call, for a specific reason: resolving a username to
// its email has to happen where the email never reaches the client. The
// browser sends what the person typed and their password, and gets back only a
// destination or an error - never the address behind a username.
export async function signInWithIdentifier(input: {
  identifier: string;
  password: string;
  next?: string | null;
}): Promise<{ error?: string; destination?: string }> {
  const identifier = input.identifier.trim();
  if (!identifier || !input.password) {
    return { error: "Enter your details" };
  }

  // An "@" is the only reliable tell between an email and a handle - usernames
  // can't contain one (addendum_010's format check), so this never misfires.
  let email = identifier;
  if (!identifier.includes("@")) {
    const { data, error } = await createAdminClient().rpc("email_for_username", {
      candidate: identifier,
    });
    if (error) {
      console.error("email_for_username failed:", error.message);
      return { error: "Something went wrong. Please try again." };
    }
    // No such username. Deliberately the same message as a wrong password, so
    // this can't be used to test which usernames exist.
    if (!data) return { error: "Incorrect username or password" };
    email = data as string;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: input.password,
  });

  if (error || !data.user) {
    return { error: "Incorrect email or password" };
  }

  // Coming back cancels a pending deletion, same as the old client flow.
  const restored = await cancelDeletionOnSignIn(data.user.id);
  if (restored) {
    return { destination: "/profile?restored=1" };
  }

  // An artist who never finished the claim form goes there first - they can't
  // act on anything until it's done. Otherwise honour a shared-link ?next.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, evidence_submitted")
    .eq("id", data.user.id)
    .single();

  const next = safeNext(input.next);
  const destination =
    profile?.role === "artist" && !profile.evidence_submitted
      ? "/signup/artist-profile"
      : (next ?? "/feed");

  return { destination };
}
