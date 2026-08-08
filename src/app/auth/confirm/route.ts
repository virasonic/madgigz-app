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
    console.error("auth/confirm verifyOtp failed:", error?.message);
    return NextResponse.redirect(`${origin}/signin?error=link_failed`);
  }

  console.error("auth/confirm missing token_hash/type", { tokenHash, type });
  return NextResponse.redirect(`${origin}/signin?error=link_failed`);
}
