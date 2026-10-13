// The Google Play feature graphic - 1024x500, required for every listing, one
// per locale.
//
//   node scripts/build-play-feature-graphic.mjs   -> marketing/play/feature-graphic-<lang>.png
//
// Play crops this banner differently across surfaces and can overlay a play
// button in the middle, so the wordmark sits left of centre and nothing
// important goes near an edge.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "marketing/play");
const BUILD = fs.mkdtempSync(path.join(os.tmpdir(), "play-graphic-"));
fs.mkdirSync(OUT, { recursive: true });

const CHROME_BIN =
  process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

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

const TAGLINE = {
  en: "Local gigs. Reels and tickets in one swipe.",
  es: "Conciertos locales. Reels y entradas en el mismo gesto.",
};

// Same stage-light treatment as the Instagram creatives, flattened into a band.
const page = (lang) => `<!doctype html><meta charset="utf-8"><style>
@import url("fonts.css");
*{box-sizing:border-box}
html,body{margin:0;width:1024px;height:500px;overflow:hidden;background:#0a0807;
  font-family:"Helvetica Neue",Arial,sans-serif}
.g{position:relative;width:1024px;height:500px;overflow:hidden;background:
  radial-gradient(58% 120% at 78% 8%, #73241d99, transparent 70%),
  radial-gradient(46% 100% at 8% 96%, #54c3bd22, transparent 70%),
  linear-gradient(160deg,#150d09 0%,#0a0807 62%);}
.beam{position:absolute;top:-30%;width:120px;height:160%;filter:blur(34px);
  background:linear-gradient(180deg,#d7661699,transparent 74%)}
.copy{position:absolute;left:74px;top:50%;transform:translateY(-50%);z-index:2}
.copy img{width:392px;display:block}
.tag{margin-top:22px;font-family:GaldernM;font-weight:500;font-size:26px;
  letter-spacing:.01em;color:#f3f1d1;max-width:16em;line-height:1.3}
.dot{position:absolute;right:96px;top:50%;transform:translate(0,-50%);z-index:2;
  width:250px;height:250px;border-radius:50%;
  background:radial-gradient(circle at 38% 32%, #d76616, #73241d 62%, #2a0f0c 100%);
  box-shadow:0 0 90px #d7661666}
.note{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  color:#f3f1d1}
</style>
<div class="g">
  <div class="beam" style="left:56%;transform:rotate(-16deg);opacity:.5"></div>
  <div class="beam" style="left:70%;transform:rotate(8deg);opacity:.36"></div>
  <div class="beam" style="left:84%;transform:rotate(22deg);opacity:.24"></div>
  <div class="dot"><div class="note">
    <svg width="104" height="104" viewBox="0 0 24 24" fill="none">
      <circle cx="8" cy="17" r="3" fill="currentColor"/>
      <circle cx="16" cy="14" r="3" fill="currentColor"/>
      <path d="M11 17V5l8-2v10" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </div></div>
  <div class="copy">
    <img src="${WM}">
    <p class="tag">${TAGLINE[lang]}</p>
  </div>
</div>`;

for (const lang of ["en", "es"]) {
  const f = path.join(BUILD, `${lang}.html`);
  fs.writeFileSync(f, page(lang));
  execFileSync(
    CHROME_BIN,
    [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--window-size=1024,500",
      "--virtual-time-budget=1500",
      `--screenshot=${path.join(OUT, `feature-graphic-${lang}.png`)}`,
      `file://${f}`,
    ],
    { stdio: "ignore" }
  );
}
fs.rmSync(BUILD, { recursive: true, force: true });
console.log(`feature graphics -> ${path.relative(ROOT, OUT)}/feature-graphic-{en,es}.png`);
