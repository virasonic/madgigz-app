import supabaseImageLoader from "@/lib/image-loader";
import { isNativeApp } from "@/lib/native";
import { bestLayout, layoutHeight, STORY_HEIGHT, STORY_WIDTH } from "@/lib/poster-wall-image";
import type { EventItem } from "@/lib/types";

// Browser-only story exports of a fan's attended gigs (#228). Everything draws
// onto a 1080x1920 canvas with the app's own fonts and colours, so an image
// matches the app without a server render.
//
// Three "slide" formats the fan picks between (Vir, 20 Nov), all 9:16:
//   wall     - the poster collage (the original export, enriched with photos)
//   timeline - a month in review: each gig as a row, poster + date + venue
//   night    - one night spotlit: the poster hero + that night's own photos
// The shared header (wordmark + title + count) and footer keep every format
// unmistakably MadGigz.

export type WallFormat = "wall" | "timeline" | "night";

export interface StoryCopy {
  title: string;
  subtitle: string;
  footer: string;
}

export interface TimelineRow {
  posterUrl: string;
  dateLabel: string;
  title: string;
  venue: string;
  photoUrl?: string | null;
}

export interface NightHero {
  posterUrl: string;
  eyebrow: string;
  title: string;
  dateVenue: string;
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

// object-fit: cover, centred.
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const ir = img.naturalWidth / img.naturalHeight;
  const tr = w / h;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  let sx = 0;
  let sy = 0;
  if (ir > tr) {
    sw = img.naturalHeight * tr;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    sh = img.naturalWidth / tr;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function fillTextEllipsis(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number) {
  if (ctx.measureText(text).width <= maxW) {
    ctx.fillText(text, x, y);
    return;
  }
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  ctx.fillText(t.trimEnd() + "…", x, y);
}

async function ensureFont(font: string) {
  try {
    if (typeof document !== "undefined" && "fonts" in document) await document.fonts.load(font);
  } catch {
    // The system font is the fallback; the export still works.
  }
}

interface Scaffold {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  colours: { background: string; surface: string; foreground: string; muted: string; primary: string; accent: string };
  display: string;
  sans: string;
  contentTop: number;
  footerTop: number;
}

// The shared frame: background glow, wordmark, title and subtitle at the top; a
// reserved footer line at the bottom. Each format fills the band between
// `contentTop` and `footerTop`.
async function storyScaffold(copy: StoryCopy): Promise<Scaffold | null> {
  const display = cssVar("--font-galdern-extrabold", "sans-serif");
  const sans = cssVar("--font-dm-sans", "sans-serif");
  const colours = {
    background: cssVar("--background", "#0a0807"),
    surface: cssVar("--surface", "#171210"),
    foreground: cssVar("--foreground", "#f3f1d1"),
    muted: cssVar("--muted", "#a89f8c"),
    primary: cssVar("--primary", "#d76616"),
    accent: cssVar("--accent", "#9aa0a6"),
  };

  const [wordmark] = await Promise.all([
    loadImage(WORDMARK_SRC),
    ensureFont(`800 72px ${display}`),
    ensureFont(`500 36px ${sans}`),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = STORY_WIDTH;
  canvas.height = STORY_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = colours.background;
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
  const glow = ctx.createRadialGradient(STORY_WIDTH / 2, 0, 0, STORY_WIDTH / 2, 0, 900);
  glow.addColorStop(0, "rgba(215, 102, 22, 0.22)");
  glow.addColorStop(1, "rgba(215, 102, 22, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);

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

  return { canvas, ctx, colours, display, sans, contentTop: y, footerTop: STORY_HEIGHT - PAD - 40 };
}

function storyFinish(scaf: Scaffold, footer: string): Promise<Blob | null> {
  const { ctx, colours, sans, canvas } = scaf;
  ctx.fillStyle = colours.muted;
  ctx.font = `500 30px ${sans}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(footer, STORY_WIDTH / 2, STORY_HEIGHT - PAD);
  ctx.textAlign = "left";
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92));
}

// Weave the fan's own photos in among the posters (#228 enrich) so the wall
// mixes both rather than trailing off into a block of photos: roughly one photo
// every `step` posters. Either list empty → the other is returned untouched.
function interleave(posters: HTMLImageElement[], photos: HTMLImageElement[]): HTMLImageElement[] {
  if (photos.length === 0) return posters;
  if (posters.length === 0) return photos;
  const out: HTMLImageElement[] = [];
  const step = Math.max(1, Math.round(posters.length / (photos.length + 1)));
  let pi = 0;
  let fi = 0;
  while (pi < posters.length || fi < photos.length) {
    for (let k = 0; k < step && pi < posters.length; k++) out.push(posters[pi++]);
    if (fi < photos.length) out.push(photos[fi++]);
  }
  return out;
}

/**
 * The Wall: a masonry of poster artwork (and the fan's photos when included),
 * 1080x1920 JPEG. `events` newest first. Resolves null if no poster loaded.
 */
export async function renderPosterWall(
  events: EventItem[],
  copy: StoryCopy,
  options?: { photos?: string[] }
): Promise<Blob | null> {
  const scaf = await storyScaffold(copy);
  if (!scaf) return null;
  const { ctx, colours } = scaf;
  const y = scaf.contentTop;

  const photoUrls = options?.photos ?? [];
  const [posterImgs, photoImgs] = await Promise.all([
    Promise.all(events.map((e) => (e.image ? loadImage(e.image) : Promise.resolve(null)))),
    Promise.all(photoUrls.map((src) => loadImage(src))),
  ]);

  const loadedPosters = posterImgs.filter((img): img is HTMLImageElement => img !== null);
  const loadedPhotos = photoImgs.filter((img): img is HTMLImageElement => img !== null);
  const loaded = interleave(loadedPosters, loadedPhotos);
  if (loaded.length === 0) return null;

  const area = { width: STORY_WIDTH - 2 * PAD, height: scaf.footerTop - 40 - y, gap: GAP };
  const layout = bestLayout(
    loaded.map((img) => img.naturalWidth / img.naturalHeight),
    area
  );
  const used = layoutHeight(layout);
  const offsetY = y + Math.max(0, (area.height - used) / 2);

  for (const tile of layout.tiles) {
    const img = loaded[tile.index];
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

  // No "+N more" badge: the subtitle states the real count, and Vir (20 Nov)
  // found the orange pill noisy. Posters that don't fit simply don't show.

  return storyFinish(scaf, copy.footer);
}

/**
 * The Timeline: a month in review. Each row is a gig - poster thumb, date, name,
 * venue, and a thumb of one of that night's photos when there is one. `rows`
 * newest first; extras past what fits are dropped.
 */
export async function renderTimelineStory(copy: StoryCopy, rows: TimelineRow[]): Promise<Blob | null> {
  const scaf = await storyScaffold(copy);
  if (!scaf) return null;
  const { ctx, colours, display, sans } = scaf;
  if (rows.length === 0) return storyFinish(scaf, copy.footer);

  const [posters, photos] = await Promise.all([
    Promise.all(rows.map((r) => loadImage(r.posterUrl))),
    Promise.all(rows.map((r) => (r.photoUrl ? loadImage(r.photoUrl) : Promise.resolve(null)))),
  ]);

  const CW = STORY_WIDTH - 2 * PAD;
  const y = scaf.contentTop + 8;
  const availH = scaf.footerTop - 24 - y;
  const rowGap = 20;
  const minRowH = 128;
  const maxRowH = 188;

  // Fit as many rows as read well; cap when the month is busy.
  let n = rows.length;
  let rowH = (availH - (n - 1) * rowGap) / n;
  if (rowH < minRowH) {
    n = Math.max(1, Math.floor((availH + rowGap) / (minRowH + rowGap)));
    rowH = Math.min(maxRowH, (availH - (n - 1) * rowGap) / n);
  } else if (rowH > maxRowH) {
    rowH = maxRowH;
  }

  const usedH = n * rowH + (n - 1) * rowGap;
  let ry = y + Math.max(0, (availH - usedH) / 2);

  for (let i = 0; i < n; i++) {
    const r = rows[i];
    const rx = PAD;
    ctx.save();
    ctx.fillStyle = colours.surface;
    roundedRect(ctx, rx, ry, CW, rowH, 18);
    ctx.fill();
    ctx.restore();

    const padIn = Math.round(rowH * 0.13);
    const ph = rowH - 2 * padIn;
    const pw = Math.round(ph * 0.72);

    // Poster thumb (left).
    const px = rx + padIn;
    const py = ry + padIn;
    ctx.save();
    roundedRect(ctx, px, py, pw, ph, 10);
    ctx.clip();
    if (posters[i]) drawCover(ctx, posters[i]!, px, py, pw, ph);
    else {
      ctx.fillStyle = colours.background;
      ctx.fillRect(px, py, pw, ph);
    }
    ctx.restore();

    // Photo-from-the-night thumb (right), when there is one.
    let textRight = rx + CW - padIn;
    if (photos[i]) {
      const tw = pw;
      const tx = rx + CW - padIn - tw;
      ctx.save();
      roundedRect(ctx, tx, py, tw, ph, 10);
      ctx.clip();
      drawCover(ctx, photos[i]!, tx, py, tw, ph);
      ctx.restore();
      textRight = tx - 24;
    }

    // Text block (middle).
    const tx0 = px + pw + 28;
    const maxTextW = Math.max(40, textRight - tx0 - 8);
    ctx.textBaseline = "alphabetic";
    const dateSize = Math.round(rowH * 0.22);
    const nameSize = Math.round(rowH * 0.18);
    const venSize = Math.round(rowH * 0.15);
    let ty = ry + padIn + dateSize;
    ctx.fillStyle = colours.foreground;
    ctx.font = `800 ${dateSize}px ${display}`;
    ctx.fillText(r.dateLabel, tx0, ty);
    ty += nameSize + 14;
    ctx.fillStyle = colours.foreground;
    ctx.globalAlpha = 0.85;
    ctx.font = `600 ${nameSize}px ${sans}`;
    fillTextEllipsis(ctx, r.title, tx0, ty, maxTextW);
    ctx.globalAlpha = 1;
    ty += venSize + 12;
    ctx.fillStyle = colours.muted;
    ctx.font = `500 ${venSize}px ${sans}`;
    fillTextEllipsis(ctx, r.venue, tx0, ty, maxTextW);

    ry += rowH + rowGap;
  }

  return storyFinish(scaf, copy.footer);
}

/**
 * One Night: a single gig spotlit. The poster fills a hero card with the name
 * and venue over it; that night's photos sit in a strip beneath. With no photos
 * the poster hero simply takes the whole band.
 */
export async function renderNightStory(
  copy: StoryCopy,
  hero: NightHero,
  photoUrls: string[],
  photoLabel: string
): Promise<Blob | null> {
  const scaf = await storyScaffold(copy);
  if (!scaf) return null;
  const { ctx, colours, display, sans } = scaf;

  const [poster, photoImgs] = await Promise.all([
    loadImage(hero.posterUrl),
    Promise.all(photoUrls.slice(0, 6).map((u) => loadImage(u))),
  ]);
  const photos = photoImgs.filter((img): img is HTMLImageElement => img !== null);
  const hasPhotos = photos.length > 0;

  const CW = STORY_WIDTH - 2 * PAD;
  const y = scaf.contentTop + 8;
  const availH = scaf.footerTop - 16 - y;
  const heroH = Math.round(availH * (hasPhotos ? 0.58 : 0.86));
  const hx = PAD;
  const hy = y;

  // Poster hero with a bottom scrim so the text stays legible.
  ctx.save();
  roundedRect(ctx, hx, hy, CW, heroH, 24);
  ctx.clip();
  if (poster) drawCover(ctx, poster, hx, hy, CW, heroH);
  else {
    ctx.fillStyle = colours.surface;
    ctx.fillRect(hx, hy, CW, heroH);
  }
  const scrim = ctx.createLinearGradient(0, hy, 0, hy + heroH);
  scrim.addColorStop(0, "rgba(10,8,7,0.05)");
  scrim.addColorStop(0.5, "rgba(10,8,7,0.2)");
  scrim.addColorStop(1, "rgba(10,8,7,0.92)");
  ctx.fillStyle = scrim;
  ctx.fillRect(hx, hy, CW, heroH);
  ctx.restore();

  // Hero text, stacked up from the bottom-left of the card.
  const tx = hx + 40;
  const innerW = CW - 80;
  let by = hy + heroH - 44;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = colours.muted;
  ctx.font = `500 34px ${sans}`;
  fillTextEllipsis(ctx, hero.dateVenue, tx, by, innerW);
  by -= 70;
  ctx.fillStyle = colours.foreground;
  ctx.font = `800 78px ${display}`;
  fillTextEllipsis(ctx, hero.title, tx, by, innerW);
  by -= 70;
  ctx.fillStyle = colours.primary;
  ctx.font = `700 26px ${sans}`;
  ctx.fillText(hero.eyebrow.toUpperCase(), tx, by);

  if (hasPhotos) {
    let sy = hy + heroH + 54;
    ctx.fillStyle = colours.accent;
    ctx.font = `600 30px ${sans}`;
    ctx.fillText(photoLabel, hx, sy);
    sy += 28;

    const cols = Math.min(3, photos.length);
    const gap = 16;
    const cellW = (CW - (cols - 1) * gap) / cols;
    const numRows = Math.min(2, Math.ceil(photos.length / cols));
    const stripH = scaf.footerTop - 16 - sy;
    const cellH = Math.min(cellW * 1.15, (stripH - (numRows - 1) * gap) / numRows);

    photos.slice(0, cols * numRows).forEach((img, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = hx + col * (cellW + gap);
      const cy = sy + row * (cellH + gap);
      ctx.save();
      roundedRect(ctx, cx, cy, cellW, cellH, 12);
      ctx.clip();
      drawCover(ctx, img, cx, cy, cellW, cellH);
      ctx.restore();
    });
  }

  return storyFinish(scaf, copy.footer);
}

export type WallShareOutcome = "shared" | "downloaded" | "cancelled" | "unsupported" | "failed";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}

function isUnimplemented(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "UNIMPLEMENTED";
}

/**
 * Inside the Capacitor shells the WebView can neither open the OS share sheet
 * with a file attached nor save a download anywhere useful (iOS put it in
 * Files, Android dropped it). So the image is written to the app's cache and
 * handed to the native sheet via @capacitor/share, which is where "Instagram",
 * "Save Image" / "Save to Photos", AirDrop and the rest live. Resolves
 * `unavailable` on an installed build that predates the plugin, so the caller
 * can fall back to the web behaviour instead of failing.
 */
async function shareViaShell(blob: Blob, filename: string, title: string): Promise<WallShareOutcome | "unavailable"> {
  try {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import("@capacitor/filesystem"),
      import("@capacitor/share"),
    ]);
    const data = await blobToBase64(blob);
    const { uri } = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
    try {
      await Share.share({ title, files: [uri] });
      return "shared";
    } catch (error) {
      if (isUnimplemented(error)) return "unavailable";
      // Both shells reject with "Share canceled" when the sheet is dismissed.
      const message = error instanceof Error ? error.message : String(error);
      return /cancel/i.test(message) ? "cancelled" : "failed";
    }
  } catch (error) {
    return isUnimplemented(error) ? "unavailable" : "failed";
  }
}

/**
 * The explicit "Save image" action from the share sheet (#228). On the web it's
 * a plain download. Inside the native shell there's nowhere a raw download lands
 * usefully, so it routes through the OS share sheet (which carries "Save to
 * Photos") - same path as sharePosterWall. A native WebView that can do neither
 * reports `unsupported` so the UI can say so.
 */
export async function savePosterWall(blob: Blob, filename: string, title: string): Promise<WallShareOutcome> {
  if (isNativeApp()) return sharePosterWall(blob, filename, title);
  const nav = typeof navigator === "undefined" ? null : navigator;
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
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

/**
 * The native apps get the OS share sheet through the shell (see shareViaShell).
 * In a browser, phones and tablets get the same sheet via the Web Share API
 * with the image attached (iOS Safari, Android Chrome); everything else saves
 * it as a download. Same rule as shareEvent in share.ts: a laptop's share sheet
 * is a worse way to get an image into Instagram than a file on disk. A WebView
 * that can do neither (an Android build without the share plugin) reports
 * `unsupported` so the UI can say so instead of silently doing nothing.
 */
export async function sharePosterWall(blob: Blob, filename: string, title: string): Promise<WallShareOutcome> {
  if (isNativeApp()) {
    const native = await shareViaShell(blob, filename, title);
    if (native !== "unavailable") return native;
  }
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
