import supabaseImageLoader from "@/lib/image-loader";
import { bestLayout, layoutHeight, STORY_HEIGHT, STORY_WIDTH } from "@/lib/poster-wall-image";
import type { EventItem } from "@/lib/types";

// The one-tap, story-sized export of a fan's attended poster wall (#228).
// Browser-only: draws onto a canvas with the fonts and colours the page is
// already using, so the image matches the app without a server render.

export interface WallImageCopy {
  title: string;
  subtitle: string;
  footer: string;
  more: (count: number) => string;
}

const PAD = 72;
const GAP = 14;
const RADIUS = 18;
const WORDMARK_SRC = "/logos/madgigz-wordmark-galdern.png";
const WORDMARK_RATIO = 190 / 920;

function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

// Posters live on Supabase storage, which sends `Access-Control-Allow-Origin: *`,
// so an anonymous cross-origin load keeps the canvas exportable. Anything that
// refuses (a non-re-hosted import, a 404) resolves to null and is skipped
// rather than tainting the whole canvas. The storage render endpoint keeps the
// download small: 720px is plenty for a ~300px tile at 2x.
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const done = (ok: boolean) => resolve(ok ? img : null);
    img.onload = () => done(img.naturalWidth > 0);
    img.onerror = () => done(false);
    setTimeout(() => done(img.complete && img.naturalWidth > 0), 12_000);
    img.src = supabaseImageLoader({ src, width: 720, quality: 80 });
  });
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function ensureFont(font: string) {
  try {
    if (typeof document !== "undefined" && "fonts" in document) await document.fonts.load(font);
  } catch {
    // The system font is the fallback; the export still works.
  }
}

/**
 * Renders the wall to a 1080x1920 JPEG. `events` newest first, as the profile
 * shows them. Resolves null if no poster could be loaded at all.
 */
export async function renderPosterWall(events: EventItem[], copy: WallImageCopy): Promise<Blob | null> {
  const display = cssVar("--font-galdern-extrabold", "sans-serif");
  const sans = cssVar("--font-dm-sans", "sans-serif");
  const colours = {
    background: cssVar("--background", "#0a0807"),
    surface: cssVar("--surface", "#171210"),
    foreground: cssVar("--foreground", "#f3f1d1"),
    muted: cssVar("--muted", "#a89f8c"),
    primary: cssVar("--primary", "#d76616"),
  };

  const [wordmark, ...posters] = await Promise.all([
    loadImage(WORDMARK_SRC),
    ...events.map((e) => (e.image ? loadImage(e.image) : Promise.resolve(null))),
  ]);
  await Promise.all([ensureFont(`800 72px ${display}`), ensureFont(`500 36px ${sans}`)]);

  const loaded = posters
    .map((img, i) => ({ img, event: events[i] }))
    .filter((p): p is { img: HTMLImageElement; event: EventItem } => p.img !== null);
  if (loaded.length === 0) return null;

  const canvas = document.createElement("canvas");
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Background with a faint warm glow at the top, like the app's header.
  ctx.fillStyle = colours.background;
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
  const glow = ctx.createRadialGradient(STORY_WIDTH / 2, 0, 0, STORY_WIDTH / 2, 0, 900);
  glow.addColorStop(0, "rgba(215, 102, 22, 0.22)");
  glow.addColorStop(1, "rgba(215, 102, 22, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

  // Header: wordmark, then the title and the count.
  let y = 96;
  if (wordmark) {
    const w = 300;
    ctx.drawImage(wordmark, PAD, y, w, w * WORDMARK_RATIO);
  }
  y += 300 * WORDMARK_RATIO + 48;
  ctx.fillStyle = colours.foreground;
  ctx.font = `800 72px ${display}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(copy.title, PAD, y + 64);
  y += 64 + 24;
  ctx.fillStyle = colours.muted;
  ctx.font = `500 36px ${sans}`;
  ctx.fillText(copy.subtitle, PAD, y + 36);
  y += 36 + 56;

  // Footer reserve, then the mosaic in between.
  const footerTop = STORY_HEIGHT - PAD - 40;
  const area = { width: STORY_WIDTH - 2 * PAD, height: footerTop - 40 - y, gap: GAP };
  const layout = bestLayout(
    loaded.map((p) => p.img.naturalWidth / p.img.naturalHeight),
    area
  );
  // A sparse wall sits in the middle of the area rather than hugging the title.
  const used = layoutHeight(layout);
  const offsetY = y + Math.max(0, (area.height - used) / 2);

  for (const tile of layout.tiles) {
    const { img } = loaded[tile.index];
    const x = PAD + tile.x;
    const ty = offsetY + tile.y;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = colours.surface;
    roundedRect(ctx, x, ty, tile.w, tile.h, RADIUS);
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundedRect(ctx, x, ty, tile.w, tile.h, RADIUS);
    ctx.clip();
    ctx.drawImage(img, x, ty, tile.w, tile.h);
    ctx.restore();
  }

  if (layout.overflow > 0) {
    const label = copy.more(layout.overflow);
    ctx.font = `800 34px ${display}`;
    const tw = ctx.measureText(label).width;
    const bw = tw + 56;
    const bh = 64;
    const bx = STORY_WIDTH - PAD - bw;
    const by = offsetY + Math.min(used, area.height) - bh - 16;
    ctx.fillStyle = colours.primary;
    roundedRect(ctx, bx, by, bw, bh, bh / 2);
    ctx.fill();
    ctx.fillStyle = colours.foreground;
    ctx.textBaseline = "middle";
    ctx.fillText(label, bx + 28, by + bh / 2 + 2);
    ctx.textBaseline = "alphabetic";
  }

  // Footer.
  ctx.fillStyle = colours.muted;
  ctx.font = `500 30px ${sans}`;
  ctx.textAlign = "center";
  ctx.fillText(copy.footer, STORY_WIDTH / 2, STORY_HEIGHT - PAD);
  ctx.textAlign = "left";

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92));
}

export type WallShareOutcome = "shared" | "downloaded" | "cancelled" | "unsupported" | "failed";

/**
 * Phones and tablets get the OS share sheet with the image attached (iOS, and
 * Android Chrome); everything else saves it as a download. Same rule as
 * shareEvent in share.ts: a laptop's share sheet is a worse way to get an image
 * into Instagram than a file on disk. Inside a WebView that can do neither (the
 * Android shell today) it reports `unsupported` so the UI can say so instead of
 * silently doing nothing.
 */
export async function sharePosterWall(blob: Blob, filename: string, title: string): Promise<WallShareOutcome> {
  const file = new File([blob], filename, { type: blob.type });
  const nav = typeof navigator === "undefined" ? null : navigator;
  const touch = (nav?.maxTouchPoints ?? 0) > 0;
  if (touch && nav?.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return "shared";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return "cancelled";
      // Fall through to a download; some targets reject file shares outright.
    }
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    // A WebView without a download handler ignores this click entirely; there
    // is no event to tell us, so treat the native Android shell as unsupported.
    if (/\bwv\b|; wv\)/.test(nav?.userAgent ?? "")) {
      URL.revokeObjectURL(url);
      return "unsupported";
    }
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return "downloaded";
  } catch {
    return "failed";
  }
}
