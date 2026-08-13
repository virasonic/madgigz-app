// Server-only Cloudflare Stream calls that need the secret token (#139). Kept out
// of stream-actions.ts — which is "use server", so every export there becomes a
// client-callable action — so server code can call this directly and it never
// becomes an unguarded endpoint. NEVER import this from a client component.
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? "52cbbb4cf23e3aa44e0cfe9892ec1e26";

/**
 * Deletes a video from Cloudflare Stream so we don't accumulate orphans (+ their
 * stored minutes) when a reel, account, or event goes away. Best-effort: logs and
 * swallows failures so it can NEVER break the surrounding delete. A missing token
 * (Stream not configured) is a no-op.
 */
export async function deleteStreamVideo(uid: string | null | undefined): Promise<void> {
  const token = process.env.CLOUDFLARE_STREAM_TOKEN;
  if (!token || !uid) return;
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/stream/${uid}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) console.error("Cloudflare stream delete failed:", uid, res.status);
  } catch (err) {
    console.error("Cloudflare stream delete threw:", err);
  }
}
