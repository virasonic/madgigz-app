"use server";

import { createClient } from "@/lib/supabase/server";
import { deleteStreamVideo } from "@/lib/cloudflare-stream-server";

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

/**
 * Mints a Cloudflare Stream **resumable (TUS)** upload for a large video (#140).
 * The basic direct_upload above caps at 200MB; TUS lifts that to 30GB and, being
 * resumable, survives a dropped mobile connection mid-upload. We create the upload
 * server-side (so the secret token never reaches the browser) with `direct_user`,
 * and Cloudflare returns a one-time `Location` URL the client PATCHes chunks to
 * with tus-js-client — no token needed client-side.
 *
 * Same return contract as createStreamDirectUpload: `null` (no token → Supabase
 * fallback), `{ error }`, or `{ uploadURL, uid }` where uploadURL is the TUS
 * endpoint and uid is content_posts.stream_uid.
 *
 * `uploadLength` is the exact file size in bytes (the TUS `Upload-Length`).
 */
export async function createStreamTusUpload(
  uploadLength: number
): Promise<StreamUpload | { error: string } | null> {
  const token = process.env.CLOUDFLARE_STREAM_TOKEN;
  if (!token) return null;

  if (!Number.isInteger(uploadLength) || uploadLength <= 0) {
    return { error: "Video upload could not start" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  // TUS metadata is comma-separated `key base64(value)` pairs. maxDurationSeconds
  // keeps the reel-length cap (600s) the basic path already enforces.
  const metadata = `maxDurationSeconds ${Buffer.from("600").toString("base64")}`;

  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream?direct_user=true`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Tus-Resumable": "1.0.0",
          "Upload-Length": String(uploadLength),
          "Upload-Metadata": metadata,
        },
      }
    );
    // Success is 201 with the upload URL in the Location header and the video id
    // in stream-media-id — the body is empty, unlike the JSON direct_upload API.
    const location = res.headers.get("Location");
    const uid = res.headers.get("stream-media-id");
    if (res.status !== 201 || !location || !uid) {
      console.error("Cloudflare TUS create failed:", res.status, await res.text().catch(() => ""));
      return { error: "Video upload could not start" };
    }
    return { uploadURL: location, uid };
  } catch (err) {
    console.error("Cloudflare TUS create threw:", err);
    return { error: "Video upload could not start" };
  }
}

/**
 * Deletes the Cloudflare Stream video behind a reel the caller owns (#139),
 * called from the client when an artist deletes their post. The ownership check
 * — a content_post with this stream_uid AND artist_id = the caller — stops anyone
 * deleting another artist's video by guessing a uid (they're semi-public, in
 * playback URLs). Call it BEFORE deleting the row, while it still exists to check.
 */
export async function deleteReelStreamVideo(streamUid: string): Promise<void> {
  if (!streamUid) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data } = await supabase
    .from("content_posts")
    .select("id")
    .eq("stream_uid", streamUid)
    .eq("artist_id", user.id)
    .maybeSingle();
  if (!data) return;

  await deleteStreamVideo(streamUid);
}
