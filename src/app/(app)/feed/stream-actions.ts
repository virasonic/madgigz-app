"use server";

import { createClient } from "@/lib/supabase/server";

// Account id is not a secret (it's in every API URL, and useless without the
// token), so a baked-in default keeps setup to a single env var — the token.
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? "52cbbb4cf23e3aa44e0cfe9892ec1e26";

export type StreamUpload = { uploadURL: string; uid: string };

/**
 * Mints a one-time Cloudflare Stream direct-upload URL (#138). The browser then
 * PUTs the video straight to Cloudflare — the file never touches our server, and
 * Cloudflare transcodes it to adaptive HLS + a thumbnail on their side.
 *
 * Returns:
 *  - `null` when Stream isn't configured (no token) → the caller falls back to
 *    the old Supabase-Storage upload, so video posting keeps working before the
 *    env var is set and on any deploy where it's absent.
 *  - `{ error }` on a real failure (auth or Cloudflare rejecting the request).
 *  - `{ uploadURL, uid }` on success — store `uid` as content_posts.stream_uid.
 */
export async function createStreamDirectUpload(): Promise<
  StreamUpload | { error: string } | null
> {
  const token = process.env.CLOUDFLARE_STREAM_TOKEN;
  if (!token) return null;

  // Only a signed-in user can post content; mirrors the insert RLS on
  // content_posts. Cheap guard so the endpoint can't be used to burn Stream
  // upload reservations anonymously.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream/direct_upload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        // Reels are short; cap the reservation so a bad upload can't book hours.
        body: JSON.stringify({ maxDurationSeconds: 600, requireSignedURLs: false }),
      }
    );
    const json = await res.json();
    if (!res.ok || !json?.success || !json?.result?.uploadURL) {
      // Cloudflare's error text can echo account internals — log it, hand the
      // caller a safe message (same discipline as the Stripe/checkout errors).
      console.error("Cloudflare direct_upload failed:", json?.errors ?? res.status);
      return { error: "Video upload could not start" };
    }
    return { uploadURL: json.result.uploadURL as string, uid: json.result.uid as string };
  } catch (err) {
    console.error("Cloudflare direct_upload threw:", err);
    return { error: "Video upload could not start" };
  }
}
