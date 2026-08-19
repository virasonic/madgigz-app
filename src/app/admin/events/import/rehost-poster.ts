import type { SupabaseClient } from "@supabase/supabase-js";

// Re-host an imported poster (#118). Rather than storing a third party's image
// URL (Bandsintown, Entradium, Ticketandroll, a venue site…) — which is a
// copyright grey area and needs each host allow-listed for next/image — the
// importer fetches the image SERVER-SIDE and re-uploads it to our own public
// event-media bucket, so the stored URL is ours: renders everywhere, and is
// genuinely hosted by MadGigz. The admin still just pastes the source link.
//
// Only ever called from the admin importer (requireAdmin upstream), so the URL
// is admin-supplied, not arbitrary-user — but we still guard: http(s) only, an
// image content-type, a size cap and a timeout.

const MAX_BYTES = 10 * 1024 * 1024; // 10MB — posters are far smaller
const FETCH_TIMEOUT_MS = 10_000;

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

// Returns a public event-media URL for the re-hosted image, or null if the
// source can't be fetched/isn't an image — the caller then falls back to the
// original URL rather than losing the poster entirely.
export async function rehostPoster(
  admin: SupabaseClient,
  sourceUrl: string
): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(sourceUrl.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      // Some CDNs reject an empty/absent User-Agent.
      headers: { "User-Agent": "MadGigzImporter/1.0 (+https://madgigz.aurasonic.es)" },
    });
    if (!res.ok) return null;

    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!contentType.startsWith("image/")) return null;

    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return null;

    const ext = EXT_BY_TYPE[contentType] ?? "img";
    const path = `imported/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    const { error } = await admin.storage
      .from("event-media")
      .upload(path, bytes, { contentType, upsert: false });
    if (error) {
      console.error("rehostPoster upload failed:", error);
      return null;
    }

    const {
      data: { publicUrl },
    } = admin.storage.from("event-media").getPublicUrl(path);
    return publicUrl;
  } catch (err) {
    console.error("rehostPoster fetch failed:", sourceUrl, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
