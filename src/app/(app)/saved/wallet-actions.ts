"use server";

import { createClient } from "@/lib/supabase/server";
import { isAppleWalletConfigured } from "@/lib/apple-wallet-config";
import { signWalletToken } from "@/lib/wallet-token";

// Mints the tokenised Wallet-pass URL for a ticket the caller owns (#129). Runs
// inside the app WebView, where the login cookie exists, so getUser() works here
// even though it won't on the external browser that opens the returned URL. The
// signed token is what authorises the pass request over there.
export async function createWalletPassUrl(
  ticketId: string
): Promise<{ url: string } | { error: string }> {
  if (!isAppleWalletConfigured()) return { error: "unavailable" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "unauthorized" };

  // RLS scopes to the owner; the explicit user_id match is the second lock.
  const { data } = await supabase
    .from("tickets")
    .select("id, refunded")
    .eq("id", ticketId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data || data.refunded) return { error: "notfound" };

  const token = signWalletToken(ticketId);
  return { url: `/api/tickets/${ticketId}/pass?t=${encodeURIComponent(token)}` };
}
