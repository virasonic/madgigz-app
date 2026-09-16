// Client-safe Cloudflare Stream helpers (#138). URL builders only — no API
// token lives here, so this is safe to import into client components. The
// server-only calls (creating a direct-upload URL, deleting a video) read the
// secret token and live in stream-actions.ts instead.
//
// The customer code is PUBLIC — it appears in every playback URL — so a baked-in
// default is fine; an env var only overrides it if the account ever changes.
export const STREAM_CUSTOMER_CODE =
  process.env.NEXT_PUBLIC_CLOUDFLARE_STREAM_CUSTOMER_CODE ?? "6p2l5tinjgazdan4";

const origin = `https://customer-${STREAM_CUSTOMER_CODE}.cloudflarestream.com`;

/** Adaptive-bitrate HLS manifest. iOS/Safari WKWebView play this natively; other
 *  browsers need hls.js (see ContentReelCard). */
export function streamHlsUrl(uid: string): string {
  return `${origin}/${uid}/manifest/video.m3u8`;
}

/** Auto-generated poster frame — gives reels an instant first paint instead of a
 *  black frame while the video loads. */
export function streamThumbnailUrl(uid: string): string {
  return `${origin}/${uid}/thumbnails/thumbnail.jpg`;
}

/** Self-contained Stream player in an iframe — handles HLS + controls itself, so
 *  a one-off player (e.g. the #184 "view my post" lightbox) needs no hls.js. The
 *  feed's reel card uses the raw HLS URL + hls.js instead, for autoplay control. */
export function streamIframeUrl(uid: string): string {
  return `${origin}/${uid}/iframe`;
}
