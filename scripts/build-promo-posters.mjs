// Print-ready MadGigz download posters (#170) - the three approved concepts, in
// English and Spanish, rendered at A4 300dpi.
//
//   node scripts/build-promo-posters.mjs   -> PromoPoster/madgigz-poster-*.png
//
// Same headless-Chrome pattern as build-play-feature-graphic.mjs: embed the
// wordmark, render an HTML page sized to the exact pixel target, screenshot it.
// The QR is baked in as a data URI (qrcode pkg) pointing at the web landing,
// which routes phones to the App Store / Google Play (the #169 prompt). Fonts
// load from Google Fonts over the network - give Chrome a generous virtual-time
// budget so they're painted before the shot.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import QRCode from "qrcode";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "PromoPoster");
const BUILD = fs.mkdtempSync(path.join(os.tmpdir(), "promo-poster-"));
fs.mkdirSync(OUT, { recursive: true });

const CHROME_BIN =
  process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// A4 portrait @ 300dpi.
const W = 2480;
const H = 3508;

const WM =
  "data:image/png;base64," +
  fs.readFileSync(path.join(ROOT, "public/logos/madgigz-wordmark.png")).toString("base64");

// The real For-You feed screenshot used on the store listings.
const FEED =
  "data:image/png;base64," +
  fs
    .readFileSync(path.join(ROOT, "marketing/store-screenshots/raw/01-feed.png"))
    .toString("base64");

// Tagged, or every scan lands in /admin/attribution as "(direct)" and the
// posters look like they produced nothing. Straight to the app rather than via
// aurasonic.es: a poster scan is already high intent, so the fewer hops the
// better, and there is no pixel to seed on an offline placement.
//
// Override per print run to tell venues apart:
//   POSTER_PLACEMENT=sala-nebula node scripts/build-promo-posters.mjs
const PLACEMENT = process.env.POSTER_PLACEMENT?.trim() || "general";
const QR_TARGET =
  "https://madgigz.aurasonic.es/?utm_source=poster&utm_medium=qr" +
  `&utm_campaign=always-on&utm_content=${encodeURIComponent(PLACEMENT)}`;

const QR = await QRCode.toDataURL(QR_TARGET, {
  margin: 1,
  width: 900,
  errorCorrectionLevel: "M",
  color: { dark: "#0a0807", light: "#f6f2e6" },
});

const T = {
  eyebrow: { en: "Live music · Madrid", es: "Música en vivo · Madrid" },
  scan: { en: "Scan to download", es: "Escanea para descargar" },
  scanGet: { en: "Scan to get it", es: "Escanea para descargar" },
  stores: { en: "App Store &amp; Google Play", es: "App Store y Google Play" },
  c1head: {
    en: 'Your city&rsquo;s gigs, <em>in a feed.</em>',
    // Tight 2-liner (a literal "Los bolos de tu ciudad..." ran 3 lines and
    // collided with the phone); "para ti" also lands the for-you pitch.
    es: 'Bolos para ti,<br /><em>en un feed.</em>',
  },
  c1sub: {
    en: "Scroll reels from independent artists near you — and grab the ticket in the same swipe.",
    es: "Desliza reels de artistas independientes cerca de ti y compra la entrada en el mismo gesto.",
  },
  admit: { en: "Admit one", es: "Entrada" },
  c2head: {
    en: "<span>Discover.</span><span class='l2'>Listen.</span><span class='l3'>Get in.</span>",
    es: "<span>Descubre.</span><span class='l2'>Escucha.</span><span class='l3'>Entra.</span>",
  },
  c2sub: {
    en: "Local live music — no emails, no faff. Your ticket lives in the app.",
    es: "Música en vivo local — sin correos ni líos. Tu entrada vive en la app.",
  },
  c2k: { en: "Scan · download free", es: "Escanea · descarga gratis" },
  c2v: {
    en: "Your seat to <em>local live.</em>",
    es: "Tu sitio en lo <em>local y en vivo.</em>",
  },
  c3kick: { en: "Local gigs · in your pocket", es: "Bolos locales · en tu bolsillo" },
  c3mega: { en: "Download<br>now", es: "Descárgala<br>ya" },
  c3one: {
    en: "A for-you page for local gigs — reels from artists near you, ticket in the same swipe.",
    es: "Un feed para ti de bolos locales — reels de artistas cerca de ti, entrada en el mismo gesto.",
  },
};

const APPLE = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.4 12.9c0-1.9 1.5-2.8 1.6-2.8-.9-1.3-2.2-1.4-2.7-1.5-1.1-.1-2.2.7-2.8.7-.6 0-1.5-.7-2.4-.6-1.2 0-2.4.7-3 1.8-1.3 2.2-.3 5.5.9 7.3.6.9 1.3 1.9 2.2 1.8.9 0 1.2-.6 2.3-.6 1.1 0 1.3.6 2.3.6 1 0 1.6-.9 2.2-1.8.7-1 1-2 1-2-.1 0-1.9-.8-1.9-2.7zM14.7 6.8c.5-.6.8-1.4.7-2.3-.7 0-1.6.5-2.1 1.1-.5.5-.9 1.4-.8 2.2.8.1 1.6-.4 2.2-1z"/></svg>`;
const PLAY = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 3.3v17.4c0 .5.3.8.7.6l9.8-5.6-2.9-2.9L4 3.3zm12.2 6.9L6.6 4.7l7.1 7.1 2.5-1.6zM6.6 19.3l9.6-5.5-2.5-1.6-7.1 7.1zm11.9-8.1-2.1-1.2-2.7 2.7 2.7 2.7 2.1-1.2c.8-.5.8-1.7 0-2.2z"/></svg>`;

const HEAD = `<!doctype html><meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=DM+Sans:wght@400;500;700&display=swap" />
<style>
  :root{--bg:#0a0807;--primary:#d76616;--cream:#f3f1d1;--teal:#54c3bd;--muted:#a89f8c;--paper:#f6f2e6;
    --display:"Bricolage Grotesque","DM Sans",system-ui,sans-serif;--body:"DM Sans",system-ui,sans-serif}
  *{box-sizing:border-box;margin:0}
  html,body{width:${W}px;height:${H}px;overflow:hidden;background:var(--bg)}
  .poster{container-type:inline-size;width:${W}px;height:${H}px;position:relative;color:var(--cream);
    font-family:var(--body);background:var(--bg);overflow:hidden;-webkit-font-smoothing:antialiased}
  .wordmark{width:42%;height:auto;display:block}
  .qrbox{background:var(--paper);padding:3.2cqw;border-radius:2.2cqw;width:27cqw;height:27cqw}
  .qrbox img{width:100%;height:100%;display:block}
  .scanline{font-weight:700;font-size:3.1cqw;letter-spacing:.02em}
  .stores{display:flex;align-items:center;gap:2.4cqw;font-weight:500;font-size:2.9cqw;color:var(--muted)}
  .stores svg{width:3.6cqw;height:3.6cqw;display:block}
  .stores .dot{width:.7cqw;height:.7cqw;border-radius:50%;background:currentColor;opacity:.5}
  /* C1 */
  .c1{display:flex;flex-direction:column;padding:7cqw;height:100%}
  .c1 .eyebrow{font-weight:700;font-size:3cqw;letter-spacing:.34em;color:var(--teal);text-transform:uppercase}
  .c1 .head{font-family:var(--display);font-weight:800;font-size:12.2cqw;line-height:.98;letter-spacing:-.03em;margin-top:4cqw}
  .c1 .head em{font-style:normal;color:var(--primary)}
  .c1 .sub{font-size:3.9cqw;line-height:1.4;color:#e6e0c8;margin-top:4.5cqw;max-width:54%}
  .c1 .reel{width:33cqw;aspect-ratio:1179/2556;border-radius:3.4cqw;position:absolute;right:6cqw;top:27cqw;transform:rotate(5deg);
    overflow:hidden;border:.7cqw solid rgba(243,241,209,.16);box-shadow:0 5cqw 14cqw rgba(0,0,0,.6)}
  .c1 .reel img{width:100%;height:100%;object-fit:cover;display:block}
  .c1 .foot{margin-top:auto;display:flex;align-items:flex-end;justify-content:space-between;gap:4cqw}
  .c1 .foot .txt{display:flex;flex-direction:column;gap:2cqw}
  /* C2 */
  .c2{display:flex;flex-direction:column;height:100%}
  .c2 .top{padding:7cqw 7cqw 5cqw}
  .c2 .rowline{display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:2.9cqw;letter-spacing:.28em;text-transform:uppercase;color:var(--muted)}
  .c2 .head{font-family:var(--display);font-weight:800;font-size:11.5cqw;line-height:1;letter-spacing:-.02em;margin-top:6cqw}
  .c2 .head span{display:block}
  .c2 .head .l2{color:var(--primary)}
  .c2 .head .l3{color:var(--teal)}
  .c2 .sub{font-size:3.7cqw;line-height:1.45;color:#e6e0c8;margin-top:5cqw;max-width:88%}
  .c2 .perf{border-top:.6cqw dashed rgba(243,241,209,.35);margin-top:auto;position:relative}
  .c2 .perf::before,.c2 .perf::after{content:"";position:absolute;top:-4cqw;width:8cqw;height:8cqw;border-radius:50%;background:#0a0807}
  .c2 .perf::before{left:-4cqw}.c2 .perf::after{right:-4cqw}
  .c2 .stub{padding:6cqw 7cqw 7cqw;display:flex;align-items:center;justify-content:space-between;gap:4cqw}
  .c2 .meta .k{font-size:2.6cqw;letter-spacing:.2em;text-transform:uppercase;color:var(--muted)}
  .c2 .meta .v{font-family:var(--display);font-weight:700;font-size:5.4cqw;margin-top:1cqw}
  .c2 .meta .v em{font-style:normal;color:var(--primary)}
  /* C3 */
  .c3{background:var(--primary);color:#140b04;padding:7cqw;display:flex;flex-direction:column;height:100%}
  .c3 .wm-wrap{filter:brightness(0) saturate(100%);opacity:.92}
  .c3 .kick{font-weight:700;font-size:3.2cqw;letter-spacing:.22em;text-transform:uppercase;margin-top:5cqw}
  .c3 .mega{font-family:var(--display);font-weight:800;line-height:.9;letter-spacing:-.045em;font-size:13.5cqw;margin-top:3cqw;text-transform:uppercase}
  .c3 .oneliner{font-size:3.8cqw;line-height:1.4;font-weight:500;margin-top:5cqw;max-width:92%}
  .c3 .foot{margin-top:auto;display:flex;align-items:flex-end;justify-content:space-between;gap:4cqw}
  .c3 .qrbox{background:var(--bg)}
  .c3 .scanline,.c3 .stores{color:#140b04}.c3 .stores{opacity:.8}
</style>`;

const storesRow = (lang, deep) => `<div class="stores">${
  deep ? "" : `${APPLE}<span class="dot"></span>${PLAY}`
}<span>${T.stores[lang]}</span></div>`;

const c1 = (lang) => `<div class="poster"><div class="c1">
  <div class="eyebrow">${T.eyebrow[lang]}</div>
  <h1 class="head">${T.c1head[lang]}</h1>
  <p class="sub">${T.c1sub[lang]}</p>
  <div class="reel"><img src="${FEED}" alt="" /></div>
  <div class="foot"><div class="txt">
    <div class="scanline">${T.scan[lang]}</div>${storesRow(lang, false)}
  </div><div class="qrbox"><img src="${QR}" /></div></div>
</div></div>`;

const c2 = (lang) => `<div class="poster"><div class="c2">
  <div class="top">
    <div class="rowline"><span>${T.admit[lang]}</span><span>Madrid</span></div>
    <img class="wordmark" src="${WM}" style="margin-top:5cqw" />
    <h1 class="head">${T.c2head[lang]}</h1>
    <p class="sub">${T.c2sub[lang]}</p>
  </div>
  <div class="perf"></div>
  <div class="stub"><div class="meta">
    <div class="k">${T.c2k[lang]}</div>
    <div class="v">${T.c2v[lang]}</div>
    <div style="margin-top:3cqw">${storesRow(lang, false)}</div>
  </div><div class="qrbox"><img src="${QR}" /></div></div>
</div></div>`;

const c3 = (lang) => `<div class="poster"><div class="c3">
  <div class="wm-wrap"><img class="wordmark" src="${WM}" /></div>
  <div class="kick">${T.c3kick[lang]}</div>
  <div class="mega">${T.c3mega[lang]}</div>
  <p class="oneliner">${T.c3one[lang]}</p>
  <div class="foot"><div class="txt">
    <div class="scanline">${T.scanGet[lang]}</div>${storesRow(lang, true)}
  </div><div class="qrbox"><img src="${QR}" /></div></div>
</div></div>`;

const concepts = [
  { n: 1, name: "feed", render: c1 },
  { n: 2, name: "ticket", render: c2 },
  { n: 3, name: "bigcta", render: c3 },
];

for (const c of concepts) {
  for (const lang of ["en", "es"]) {
    const f = path.join(BUILD, `${c.n}-${lang}.html`);
    fs.writeFileSync(f, `${HEAD}<body>${c.render(lang)}</body>`);
    const out = path.join(OUT, `madgigz-poster-${c.n}-${c.name}-${lang}.png`);
    execFileSync(
      CHROME_BIN,
      [
        "--headless",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        `--window-size=${W},${H}`,
        "--virtual-time-budget=6000",
        `--screenshot=${out}`,
        `file://${f}`,
      ],
      { stdio: "ignore" }
    );
    console.log("->", path.relative(ROOT, out));
  }
}

fs.rmSync(BUILD, { recursive: true, force: true });
console.log(`\nDone. 6 posters (A4 300dpi) in ${path.relative(ROOT, OUT)}/`);
