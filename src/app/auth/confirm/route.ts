import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error, data } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

    if (!error && data.user) {
      if (type === "recovery") {
        return NextResponse.redirect(`${origin}/signin/reset-password`);
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();

      const destination = profile?.role === "artist" ? "/signup/artist-profile" : "/feed";
      return NextResponse.redirect(`${origin}${destination}`);
    }

    // Supabase's own error text ("Email link is invalid or has expired") is
    // written for developers, not the person who just clicked a link in their
    // inbox - log the real reason, hand the page a safe code instead of the
    // raw message. Same pattern as the Stripe/checkout error hardening.
    //
    // The usual cause is not a broken link. Mail providers scan links before
    // the recipient sees them: measured on real signups, accounts were being
    // confirmed 13-15 seconds after creation, which is a scanner, not a person.
    // That fetch consumes the single-use token and completes the verification,
    // so the human's tap is the second attempt and fails - on an account that
    // is already verified. Supabase returns the same message whether the token
    // was consumed or genuinely expired, so the copy has to hold for both.
    //
    // Which is reassuring depends on the link: a spent signup link means
    // "you're verified, go sign in", while a spent reset link means "ask for
    // another" - telling a locked-out user to sign in would be useless.
    console.error("auth/confirm verifyOtp failed:", { type, message: error?.message });
    const code = type === "recovery" ? "reset_link_spent" : "verify_link_spent";
    return NextResponse.redirect(`${origin}/signin?notice=${code}`);
  }

  // No token at all. The email templates used to link to {{ .ConfirmationURL }},
  // which is Supabase's own verify endpoint - it consumes the token itself and
  // then redirects here with nothing in the query string. Anyone arriving that
  // way has already been verified by that endpoint, so "sign in below" is the
  // correct advice, not "your link looks broken". Emails sent before the
  // templates were fixed still land here, so this has to stay friendly.
  console.error("auth/confirm missing token_hash/type", { tokenHash, type });
  return NextResponse.redirect(`${origin}/signin?notice=verify_link_spent`);
}
