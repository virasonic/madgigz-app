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

    console.error("auth/confirm verifyOtp failed:", error?.message);
    return NextResponse.redirect(
      `${origin}/signin?error=${encodeURIComponent(error?.message ?? "verify_failed")}`
    );
  }

  console.error("auth/confirm missing token_hash/type", { tokenHash, type });
  return NextResponse.redirect(`${origin}/signin?error=missing_token`);
}
