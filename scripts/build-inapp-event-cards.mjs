// Apple In-App Event artwork — the two 1920x1080 assets App Store Connect asks
// for per event ("Event card" and "Event details page"), in English and Spanish.
//
//   node scripts/build-inapp-event-cards.mjs "Niños Bravos"
//     -> marketing/inapp-events/<slug>/{card,details}-{en,es}.png
//
// The event is read live from Supabase by title, so the date, venue and price on
// the artwork cannot drift from what the app shows. Posters are supplied by
// artists and promoters and rarely share our palette (this one is magenta and
// lime), so the accent is sampled from the poster itself rather than taken from
// the brand or from events.accent_color — the card has to look like the gig, not
// like us. Only the wordmark stays brand-coloured.
//
// The card is seen at thumbnail size in App Store search, so it carries the
// artist name, the date and nothing else; the details page is seen full width
// and can afford the rest.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHROME_BIN =
  process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const query = process.argv[2];
if (!query) {
  console.error('usage: node scripts/build-inapp-event-cards.mjs "<event title>"');
  process.exit(1);
}

// --- env ------------------------------------------------------------------
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^["']|["']$/g, "")])
);
const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

// --- event ----------------------------------------------------------------
const cols =
  "title,artist_name,venue,city,event_date,event_time,price,currency,image_url,description,lineup,age_restriction,ticketing_mode,category";
const res = await fetch(
  `${SB_URL}/rest/v1/events?select=${cols}&title=ilike.*${encodeURIComponent(query)}*&limit=1`,
  { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
);
const [ev] = await res.json();
if (!ev) {
  console.error(`no event matching "${query}"`);
  process.exit(1);
}

const slug = ev.title
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");
const OUT = path.join(ROOT, "marketing/inapp-events", slug);
const BUILD = fs.mkdtempSync(path.join(os.tmpdir(), "inapp-event-"));
fs.mkdirSync(OUT, { recursive: true });

// --- poster + sampled accent ----------------------------------------------
const posterBuf = Buffer.from(await (await fetch(ev.image_url)).arrayBuffer());
const hex = (c) => "#" + [c.r, c.g, c.b].map((n) => n.toString(16).padStart(2, "0")).join("");

// Posters are art, not brand assets, and the most *common* colour is nearly
// always the background — the Hard Fuse bill is a black-and-white photo with one
// lime accent, and sharp's dominant returns #080808 for it, which would render
// the eyebrow and rule invisible. So find the most *vivid* colour instead:
// bucket the saturated, mid-lightness pixels by hue and take the biggest bucket.
// Fall back to the plain average, and then to brand orange, for a poster with no
// colour in it at all.
const accentFrom = async (buf) => {
  const [W, H] = [72, 90];
  const { data } = await sharp(buf)
    .resize(W, H, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 3) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max === min) continue;
    const light = (max + min) / 510;
    const sat = (max - min) / (255 - Math.abs(max + min - 255));
    if (sat < 0.35 || light < 0.22 || light > 0.82) continue;
    const c = max - min;
    const hue =
      max === r ? ((g - b) / c + 6) % 6 : max === g ? (b - r) / c + 2 : (r - g) / c + 4;
    const key = Math.round((hue * 60) / 24); // 24-degree hue buckets
    const e = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n += 1;
    e.r += r;
    e.g += g;
    e.b += b;
    buckets.set(key, e);
  }
  const best = [...buckets.values()].sort((a, b) => b.n - a.n)[0];
  if (best && best.n > W * H * 0.004) {
    return { r: Math.round(best.r / best.n), g: Math.round(best.g / best.n), b: Math.round(best.b / best.n) };
  }
  const { dominant } = await sharp(buf).stats();
  const lum = (dominant.r * 0.299 + dominant.g * 0.587 + dominant.b * 0.114) / 255;
  return lum < 0.18 ? { r: 215, g: 102, b: 22 } : dominant;
};

const dominant = await accentFrom(posterBuf);
const ACCENT = hex(dominant);
// A darkened twin of the accent for the wash, so the scrim never fights the poster.
const DEEP = hex({
  r: Math.round(dominant.r * 0.28),
  g: Math.round(dominant.g * 0.28),
  b: Math.round(dominant.b * 0.3),
});
const POSTER = `data:image/jpeg;base64,${posterBuf.toString("base64")}`;

const b64 = (rel) => fs.readFileSync(path.join(ROOT, rel)).toString("base64");
const WM = "data:image/png;base64," + b64("public/logos/madgigz-wordmark-galdern.png");
fs.writeFileSync(
  path.join(BUILD, "fonts.css"),
  `@font-face{font-family:Galdern;src:url(data:font/otf;base64,${b64(
    "src/app/fonts/Galdern-ExtraBold.otf"
  )}) format("opentype");font-weight:800}
@font-face{font-family:GaldernM;src:url(data:font/otf;base64,${b64(
    "src/app/fonts/Galdern-Medium.otf"
  )}) format("opentype");font-weight:500}`
);

// --- copy -----------------------------------------------------------------
const d = new Date(`${ev.event_date}T${ev.event_time ?? "00:00"}`);
const fmt = (lang, o) => new Intl.DateTimeFormat(lang === "es" ? "es-ES" : "en-GB", o).format(d);
const isFree = Number(ev.price) === 0;
const price = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: ev.currency ?? "EUR",
  minimumFractionDigits: Number.isInteger(Number(ev.price)) ? 0 : 2,
}).format(ev.price);

const T = {
  en: {
    eyebrow: "Live in Madrid",
    dateline: `${fmt("en", { day: "numeric", month: "long" })} · ${ev.event_time?.slice(0, 5)}`,
    from: isFree ? "Entry" : "Tickets from",
    price: isFree ? "Free" : price,
    where: "Where",
    when: "When",
    age: "Age",
    cta: isFree ? "Watch the reel. Claim your spot." : "Watch the reel. Get the ticket.",
  },
  es: {
    eyebrow: "En directo en Madrid",
    dateline: `${fmt("es", { day: "numeric", month: "long" })} · ${ev.event_time?.slice(0, 5)}`,
    from: isFree ? "Entrada" : "Entradas desde",
    price: isFree ? "Gratis" : price,
    where: "Dónde",
    when: "Cuándo",
    age: "Edad",
    cta: isFree ? "Mira el reel. Reserva tu sitio." : "Mira el reel. Consigue la entrada.",
  },
};

// Whole sentences up to ~210 characters — a hard character clamp lands
// mid-word, and taking only the first sentence left "La cuenta atrás ha
// terminado." sitting alone under the fold.
const blurb = (text) => {
  if (!text) return "";
  let out = "";
  for (const s of text.split(/(?<=\.)\s+/)) {
    if (out && (out + " " + s).length > 210) break;
    out = out ? `${out} ${s}` : s;
  }
  return out;
};

const STORY_FOOT = 200;

const shell = (inner, [W, H] = [1920, 1080], pad = 72) => `<!doctype html><meta charset="utf-8"><style>
@import url("fonts.css");
*{box-sizing:border-box}
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#0a0807;
  font-family:"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
.stage{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:#0a0807}
/* The poster, blown up and blurred, is the light source. */
.amb{position:absolute;inset:-12%;background-image:url("${POSTER}");background-size:cover;
  background-position:center;filter:blur(96px) saturate(1.5);opacity:.85}
.scrim{position:absolute;inset:0;background:
  radial-gradient(128% 118% at 50% 46%, transparent 4%, #0a0807b8 58%, #0a0807f2 100%),
  linear-gradient(180deg,#0a080759,transparent 34%,#0a080766)}
.glow{position:absolute;top:50%;width:1120px;height:1120px;transform:translateY(-50%);
  border-radius:50%;filter:blur(60px);opacity:.5;
  background:radial-gradient(circle,${ACCENT} 0%,${DEEP}00 62%)}
.safe{position:absolute;inset:${pad}px;z-index:3;display:flex;color:#f3f1d1}
.poster{border-radius:22px;overflow:hidden;box-shadow:0 44px 110px #000000b3,
  0 0 0 1px ${ACCENT}59;flex:none;background:#000}
.poster img{display:block;width:100%;height:100%;object-fit:cover}
.wm{width:186px;display:block;opacity:.94}
.eyebrow{font-family:GaldernM;font-weight:500;letter-spacing:.16em;text-transform:uppercase;
  color:${ACCENT};filter:brightness(1.5)}
.name{font-family:Galdern;font-weight:800;line-height:.9;letter-spacing:-.015em;
  text-transform:uppercase;color:#f3f1d1;margin:0}
.meta{font-family:GaldernM;font-weight:500;color:#f3f1d1;opacity:.95}
.rule{height:3px;border-radius:2px;background:${ACCENT};opacity:.85}
</style>${inner}`;

// Event card — read at thumbnail size in search results, so: name, date, venue.
const card = (lang) => {
  const t = T[lang];
  return shell(`<div class="stage">
  <div class="amb"></div><div class="glow" style="right:-180px"></div><div class="scrim"></div>
  <div class="safe" style="align-items:stretch;gap:76px">
    <div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:space-between">
      <img class="wm" src="${WM}">
      <div>
        <p class="eyebrow" style="font-size:27px;margin:0 0 20px">${t.eyebrow}</p>
        <h1 class="name" style="font-size:${ev.artist_name.length > 16 ? 116 : 152}px">${
          ev.artist_name
        }</h1>
        <div class="rule" style="width:132px;margin:36px 0 32px"></div>
        <p class="meta" style="font-size:46px;margin:0">${t.dateline}</p>
        <p class="meta" style="font-size:40px;margin:16px 0 0;opacity:.78">${ev.venue}, ${ev.city}</p>
      </div>
      <p class="eyebrow" style="font-size:24px;margin:0">${t.cta}</p>
    </div>
    <div class="poster" style="width:600px;height:750px;align-self:center"><img src="${POSTER}"></div>
  </div>
</div>`);
};

// Event details page — shown full width above the description, so it can carry
// the practical detail a fan actually needs.
const details = (lang) => {
  const t = T[lang];
  const cell = (k, v) =>
    `<div><p class="eyebrow" style="font-size:21px;margin:0 0 10px">${k}</p>
     <p class="meta" style="font-size:33px;margin:0">${v}</p></div>`;
  return shell(`<div class="stage">
  <div class="amb"></div><div class="glow" style="left:-220px"></div><div class="scrim"></div>
  <div class="safe" style="align-items:center;gap:72px">
    <div class="poster" style="width:672px;height:840px"><img src="${POSTER}"></div>
    <div style="flex:1;min-width:0">
      <img class="wm" src="${WM}">
      <h1 class="name" style="font-size:${
        ev.artist_name.length > 16 ? 96 : 122
      }px;margin:40px 0 0">${ev.artist_name}</h1>
      <div class="rule" style="width:112px;margin:30px 0 34px"></div>
      <div style="display:flex;gap:64px;flex-wrap:wrap">
        ${cell(t.when, `${fmt(lang, { weekday: "short", day: "numeric", month: "short" })} · ${ev.event_time?.slice(0, 5)}`)}
        ${cell(t.where, `${ev.venue}, ${ev.city}`)}
        ${cell(t.from, t.price)}
        ${ev.age_restriction ? cell(t.age, ev.age_restriction) : ""}
      </div>
      <p class="meta" style="font-size:31px;line-height:1.45;margin:44px 0 0;opacity:.82;max-width:22em">${blurb(
        ev.description
      )}</p>
      <p class="eyebrow" style="font-size:26px;margin:40px 0 0">${t.cta}</p>
    </div>
  </div>
</div>`);
};

// Vertical 9:16 — the repo's story format (see marketing/ig-carousel/stories).
// Poster on top because it is what stops a thumb; the practical line sits under
// it, clear of the phone UI that crowds the last ~180px of a story. The poster
// box is sized 4:5 to match the posters themselves — stretching it to the full
// column width crops the art (this one lost "GIRA 2026" off the top and the
// promoter logos off the bottom), and a poster is one composed thing.
const story = (lang) => {
  const t = T[lang];
  return shell(
    `<div class="stage">
  <div class="amb"></div><div class="glow" style="left:-20px;width:1120px;height:1120px"></div>
  <div class="scrim"></div>
  <div class="safe" style="flex-direction:column;align-items:flex-start;gap:0;
       justify-content:space-between;bottom:${STORY_FOOT}px">
    <img class="wm" src="${WM}" style="width:212px">
    <div class="poster" style="width:820px;height:1025px;align-self:center"><img src="${POSTER}"></div>
    <div style="width:100%">
      <p class="eyebrow" style="font-size:26px;margin:0 0 16px">${t.eyebrow}</p>
      <h1 class="name" style="font-size:${ev.artist_name.length > 16 ? 76 : 96}px">${
        ev.artist_name
      }</h1>
      <div class="rule" style="width:108px;margin:26px 0 24px"></div>
      <p class="meta" style="font-size:38px;margin:0">${t.dateline}</p>
      <p class="meta" style="font-size:33px;margin:12px 0 0;opacity:.78">${ev.venue}, ${ev.city}</p>
    </div>
  </div>
</div>`,
    [1080, 1920],
    80
  );
};

for (const lang of ["en", "es"]) {
  for (const [kind, html, size] of [
    ["card", card(lang), "1920,1080"],
    ["details", details(lang), "1920,1080"],
    ["story", story(lang), "1080,1920"],
  ]) {
    const f = path.join(BUILD, `${kind}-${lang}.html`);
    fs.writeFileSync(f, html);
    execFileSync(
      CHROME_BIN,
      [
        "--headless",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        `--window-size=${size}`,
        "--virtual-time-budget=3000",
        `--screenshot=${path.join(OUT, `${kind}-${lang}.png`)}`,
        `file://${f}`,
      ],
      { stdio: "ignore" }
    );
  }
}
fs.rmSync(BUILD, { recursive: true, force: true });
console.log(
  `${ev.title} (${ev.event_date}, ${ev.venue}) accent ${ACCENT}\n` +
    `-> ${path.relative(ROOT, OUT)}/{card,details}-{en,es}.png  1920x1080\n` +
    `-> ${path.relative(ROOT, OUT)}/story-{en,es}.png            1080x1920`
);
