import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/site";

// Where an OAuth provider drops the person once they've said yes.
//
// Distinct from /auth/confirm, which handles email links: that one verifies a
// one-time token from an inbox, this one exchanges an OAuth code for a session.
// They diverge again immediately afterwards, because a Google account arrives
// with no username, no role and no date of birth - see addendum_025.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  const role = searchParams.get("role") === "artist" ? "artist" : null;

  // The provider refused, or the person hit "cancel" on Google's screen. Not an
  // error worth a scary page - they simply changed their mind.
  const oauthError = searchParams.get("error");
  if (oauthError) {
    console.error("auth/callback provider error:", {
      error: oauthError,
      description: searchParams.get("error_description"),
    });
    return NextResponse.redirect(`${origin}/signin?notice=oauth_cancelled`);
  }

  if (!code) {
    console.error("auth/callback reached with no code");
    return NextResponse.redirect(`${origin}/signin?notice=link_invalid`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    console.error("auth/callback exchange failed:", error?.message);
    return NextResponse.redirect(`${origin}/signin?notice=oauth_failed`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, onboarding_complete, evidence_submitted")
    .eq("id", data.user.id)
    .single();

  // First time through Google: the trigger parked them with a placeholder
  // username and no date of birth, so nothing else can happen until they fill
  // those in. This outranks ?next - an account without an age on file must not
  // reach a checkout page.
  if (!profile || !profile.onboarding_complete) {
    const params = new URLSearchParams();
    if (role) params.set("role", role);
    if (next) params.set("next", next);
    const query = params.toString();
    return NextResponse.redirect(
      `${origin}/signup/complete-profile${query ? `?${query}` : ""}`
    );
  }

  // Everyone else is an existing account. Supabase links a Google identity to
  // the password account with the same verified email, so this is also the path
  // someone takes when they signed up with a password months ago and today
  // tapped Google instead - they land in their own account, not a second one.
  //
  // Same precedence as the sign-in form: an artist who never finished the claim
  // form goes there first, because they can't act on anything until they do.
  const destination =
    profile.role === "artist" && !profile.evidence_submitted
      ? "/signup/artist-profile"
      : (next ?? "/feed");

  return NextResponse.redirect(`${origin}${destination}`);
}
