// Builds the Instagram carousel ad creatives (1080x1080 PNGs) for the fan and
// artist campaigns, in Spanish and English.
//
//   node scripts/build-ig-carousel.mjs        -> marketing/ig-carousel/*.png
//
// Rendered by driving headless Chrome over generated HTML rather than by hand
// in a design tool, so a copy change is a one-line edit here and a re-run - and
// so the creatives use the app's real brand tokens, fonts and reel layout
// (kept in step with src/components/feed/ContentReelCard.tsx by eye).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import QRCode from "qrcode";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "marketing/ig-carousel");
const BUILD = fs.mkdtempSync(path.join(os.tmpdir(), "ig-carousel-"));
fs.mkdirSync(OUT, { recursive: true });

const CHROME_BIN =
  process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SITE = "madgigz.aurasonic.es";

const b64 = (rel) => fs.readFileSync(path.join(ROOT, rel)).toString("base64");

// Brand fonts and the wordmark are inlined so the page has no external
// requests - Chrome would otherwise refuse the file:// font fetch.
fs.writeFileSync(
  path.join(BUILD, "fonts.css"),
  `@font-face{font-family:Galdern;src:url(data:font/otf;base64,${b64(
    "src/app/fonts/Galdern-ExtraBold.otf"
  )}) format("opentype");font-weight:800;font-style:normal}
@font-face{font-family:GaldernM;src:url(data:font/otf;base64,${b64(
    "src/app/fonts/Galdern-Medium.otf"
  )}) format("opentype");font-weight:500;font-style:normal}`
);

const WM = "data:image/png;base64," + b64("public/logos/madgigz-wordmark-galdern.png");
const URL_SITE = SITE;
const qrDataUrl = await QRCode.toDataURL(`https://${SITE}`, {
  margin: 0,
  width: 480,
  color: { dark: "#0a0807", light: "#f3f1d1" },
});

const C = {
  bg: "#0a0807",
  surface: "#171210",
  raised: "#211a17",
  primary: "#d76616",
  primaryDark: "#73241d",
  accent: "#54c3bd",
  fg: "#f3f1d1",
  muted: "#a89f8c",
};

const GRAIN =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3"/></filter><rect width="220" height="220" filter="url(#n)" opacity="0.5"/></svg>`
  );

/* ---------------------------------------------------------------- artwork */

// A gig "photo" without a photo: stage bloom, light beams, crowd silhouette.
function reelArt(seed, tint) {
  const beams = [-22, -8, 9, 24]
    .map(
      (deg, i) =>
        `<div style="position:absolute;top:-14%;left:${18 + i * 20}%;width:${
          80 + ((seed * 13 + i * 7) % 60)
        }px;height:130%;transform:rotate(${deg}deg);filter:blur(26px);opacity:${
          0.5 - i * 0.07
        };background:linear-gradient(180deg,${tint}cc,transparent 72%)"></div>`
    )
    .join("");

  // Heads + shoulders in two rows, so the crowd reads as depth rather than a
  // line of blobs. Deterministic from the seed.
  let crowd = "";
  for (const row of [0, 1]) {
    const sc = row === 0 ? 0.72 : 1;
    let x = -30;
    let n = 0;
    while (x < 540) {
      const r = (18 + ((seed * 7 + n * 11 + row * 5) % 13)) * sc;
      const y = (row === 0 ? 214 : 262) + ((seed * 5 + n * 17 + row * 9) % 24) * sc;
      crowd += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/>` +
        `<ellipse cx="${x.toFixed(1)}" cy="${(y + r * 2.1).toFixed(1)}" rx="${(r * 1.95).toFixed(1)}" ry="${(r * 1.7).toFixed(1)}"/>`;
      if ((seed + n + row) % 4 === 0) {
        const ax = x + r * 1.4;
        crowd += `<path d="M${ax.toFixed(1)} ${(y + 26 * sc).toFixed(1)} L${(ax + 8 * sc).toFixed(1)} ${(y - 62 * sc).toFixed(1)} l${(12 * sc).toFixed(1)} 3 l${(-5 * sc).toFixed(1)} ${(70 * sc).toFixed(1)} Z"/>`;
      }
      x += r * 2.05 + 8;
      n += 1;
    }
  }

  return `<div class="art">
    <div style="position:absolute;inset:0;background:
      radial-gradient(52% 30% at 50% 20%, ${tint}cc, transparent 70%),
      radial-gradient(60% 34% at 14% 40%, ${C.primaryDark}dd, transparent 74%),
      radial-gradient(44% 26% at 90% 46%, ${C.accent}59, transparent 72%),
      linear-gradient(180deg,#1d1109 0%, #140c07 55%, #090606 100%)"></div>
    ${beams}
    <!-- stage haze: the crowd below only reads as silhouette against light -->
    <div style="position:absolute;left:-10%;right:-10%;top:48%;height:34%;filter:blur(30px);
      background:radial-gradient(58% 100% at 50% 45%, ${tint}cc, ${tint}44 55%, transparent 78%)"></div>
    <div style="position:absolute;left:0;right:0;top:60%;height:14%;filter:blur(20px);
      background:linear-gradient(180deg,transparent,rgba(255,214,150,.5),transparent)"></div>
    <svg viewBox="0 0 480 420" preserveAspectRatio="xMidYMax slice"
         style="position:absolute;left:0;right:0;bottom:0;width:100%;height:62%;fill:#000;opacity:.97;stroke:${tint};stroke-width:2.5;stroke-opacity:.6">
      ${crowd}
    </svg>
    <div style="position:absolute;inset:0;background:url('${GRAIN}');opacity:.13;mix-blend-mode:overlay"></div>
  </div>`;
}

const heart = `<svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21s-8-4.9-8-10.2A4.8 4.8 0 0 1 12 7a4.8 4.8 0 0 1 8 3.8C20 16.1 12 21 12 21Z"/></svg>`;
const share = `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M12 16V3"/><path d="m7 8 5-5 5 5"/></svg>`;
const dotsIcon = `<svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>`;
const speaker = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

// The reel screen, matching src/components/feed/ContentReelCard.tsx.
function reelScreen(g) {
  return `<div class="screen">
    ${reelArt(g.seed, g.tint)}
    <div class="scrim"></div>
    <div class="top">
      <div class="avatar" style="background:${g.tint}"></div>
      <div class="who">${g.artist}</div>
      <div class="mute">${speaker}</div>
    </div>
    <div class="rail">
      <div style="color:${C.fg}">${heart}<span>${g.likes}</span></div>
      <div style="color:${C.fg}">${share}</div>
      <div style="color:${C.fg};opacity:.8">${dotsIcon}</div>
    </div>
    <div class="bot">
      <span class="pill" style="background:${g.tint}cc">${g.tag}</span>
      <h3>${g.title}</h3>
      <p class="meta">${g.venue}</p>
      <p class="meta">${g.date} · ${g.time}</p>
      <p class="cap">${g.caption}</p>
      <div class="cta" style="background:${g.tint}">
        <span class="ctaL">${g.cta}</span><span class="ctaR">${g.price}</span>
      </div>
    </div>
    <div class="tabs">
      <span class="on">${g.tabs[0]}</span><span>${g.tabs[1]}</span><span>${g.tabs[2]}</span><span>${g.tabs[3]}</span>
    </div>
  </div>`;
}

function phone(inner, style = "") {
  return `<div class="phone" style="${style}"><div class="bezel">${inner}</div></div>`;
}

function phoneWindow(inner, h, style = "", overlay = "") {
  return `<div class="phone" style="position:relative;${style}"><div class="bezel winBox" style="height:${h}px"><div class="clip" style="height:${h - 20}px">${inner}${overlay}</div></div></div>`;
}

function ticketCard(t) {
  return `<div class="ticket">
    <div class="tHead">
      <img src="${WM}" style="height:34px">
      <span class="tOk">${t.status}</span>
    </div>
    <div class="tBody">
      <h4>${t.title}</h4>
      <p>${t.venue}</p>
      <p>${t.date} · ${t.time}</p>
    </div>
    <div class="perf"></div>
    <div class="tQr"><img src="${qrDataUrl}"></div>
    <p class="tFoot">${t.foot}</p>
  </div>`;
}

/* ------------------------------------------------------------------ chrome */

function dots(i, style = "") {
  return `<div class="dots" style="${style}">${[0, 1, 2, 3, 4]
    .map((n) => `<span class="${n === i ? "d on" : "d"}"></span>`)
    .join("")}</div>`;
}

function swipeCue(txt) {
  return `<div class="swipe">${txt} <span class="arrow">→</span></div>`;
}

// Chips on one line, struck through as a group - "this chain loses you fans".
function chainRow(items, last) {
  return `<div class="chainRow strike">${items
    .map((c, i) => `<span class="chip">${c}</span>${i < items.length - 1 || !last ? `<span class="chev">→</span>` : ""}`)
    .join("")}</div>`;
}

const CSS = `
@import url("fonts.css");
*{box-sizing:border-box}
html,body{margin:0;padding:0;width:1080px;height:1080px;overflow:hidden;
  background:${C.bg};color:${C.fg};
  font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;
  -webkit-font-smoothing:antialiased}
.card{position:relative;width:1080px;height:1080px;overflow:hidden;
  background:
    radial-gradient(70% 50% at 82% -6%, ${C.primaryDark}66, transparent 70%),
    radial-gradient(60% 45% at -8% 96%, ${C.accent}1f, transparent 70%),
    ${C.bg}}
.card::after{content:"";position:absolute;inset:0;background:url('${GRAIN}');
  opacity:.09;mix-blend-mode:overlay;pointer-events:none}
.pad{position:absolute;inset:72px;display:flex;flex-direction:column}
h1{font-family:Galdern;font-weight:800;margin:0;font-size:96px;line-height:.94;
  letter-spacing:-.015em;text-transform:uppercase}
h1 em{font-style:normal;color:${C.primary}}
h1 i{font-style:normal;color:${C.accent}}
.sub{margin:26px 0 0;font-size:33px;line-height:1.34;color:${C.muted};max-width:16em}
.kicker{font-family:GaldernM;font-weight:500;font-size:24px;letter-spacing:.18em;
  text-transform:uppercase;color:${C.primary};margin:0 0 22px}
.mark{height:46px;width:auto;align-self:flex-start;opacity:.95}
.dots{position:absolute;left:72px;bottom:70px;display:flex;gap:12px;z-index:6}
.d{width:13px;height:13px;border-radius:50%;background:${C.fg};opacity:.22}
.d.on{opacity:1;background:${C.primary};width:38px;border-radius:8px}
.swipe{margin-top:46px;font-family:GaldernM;
  font-weight:500;font-size:26px;letter-spacing:.12em;text-transform:uppercase;
  color:${C.fg};opacity:.75;display:flex;align-items:center;gap:12px}
.arrow{font-size:34px;color:${C.primary}}

/* phone ------------------------------------------------------------------ */
.phone{position:absolute}
.bezel{width:466px;height:950px;border-radius:60px;padding:10px;background:#000;
  box-shadow:0 60px 120px rgba(0,0,0,.7), 0 0 0 1.5px rgba(243,241,209,.16);
  overflow:hidden}
.screen{position:relative;width:100%;height:100%;border-radius:52px;overflow:hidden;
  background:#0a0807}
.art{position:absolute;inset:0;overflow:hidden}
.scrim{position:absolute;inset:0;background:linear-gradient(180deg,
  rgba(0,0,0,.45) 0%, rgba(0,0,0,.12) 30%, rgba(0,0,0,.55) 68%, rgba(0,0,0,.93) 100%)}
.top{position:absolute;left:22px;right:22px;top:34px;display:flex;align-items:center;gap:14px}
.avatar{width:52px;height:52px;border-radius:50%;flex:none;
  box-shadow:inset 0 0 0 2px rgba(243,241,209,.35)}
.who{font-family:GaldernM;font-weight:500;font-size:26px;flex:1}
.mute{width:46px;height:46px;border-radius:50%;background:rgba(0,0,0,.42);
  display:flex;align-items:center;justify-content:center;color:${C.fg}}
.rail{position:absolute;right:22px;bottom:372px;display:flex;flex-direction:column;
  align-items:center;gap:34px;text-align:center}
.rail span{display:block;font-size:19px;margin-top:6px;color:${C.fg}}
.bot{position:absolute;left:26px;right:26px;bottom:104px}
.pill{display:inline-block;border-radius:999px;padding:7px 16px;font-family:GaldernM;
  font-weight:500;font-size:18px;letter-spacing:.09em;text-transform:uppercase}
.bot h3{font-family:Galdern;font-weight:800;font-size:44px;line-height:1.02;margin:16px 0 8px}
.meta{margin:0;font-size:23px;color:${C.muted};line-height:1.35}
.cap{margin:14px 0 0;font-size:23px;line-height:1.35}
.cta{margin-top:22px;border-radius:26px;padding:20px 26px;display:flex;
  align-items:center;justify-content:space-between}
.ctaL{font-family:Galdern;font-weight:800;font-size:28px}
.ctaR{font-family:GaldernM;font-weight:500;font-size:28px}
.tabs{position:absolute;left:0;right:0;bottom:0;height:88px;display:flex;
  align-items:center;justify-content:space-around;background:rgba(10,8,7,.92);
  border-top:1px solid rgba(243,241,209,.09);font-size:19px;color:${C.muted};
  font-family:GaldernM;font-weight:500}
.tabs .on{color:${C.primary}}

/* A cropped phone: the bottom of the reel - artwork, title, price, CTA - which
   is the part that sells. A whole phone at 9:16 leaves the CTA under IG's own
   button bar. */
.winBox{height:auto}
.clip{position:relative;width:446px;overflow:hidden;border-radius:44px}
.clip .screen{position:absolute;left:0;right:0;bottom:0;height:930px;border-radius:0}
.padS{position:absolute;left:80px;right:80px;top:280px;bottom:340px;display:flex;
  flex-direction:column;align-items:center;justify-content:center;text-align:center}
.padS h1{text-align:center}
.padS .sub{max-width:15em;margin-left:auto;margin-right:auto}
.padS .swipe{justify-content:center}
.padS .chainRow,.padS .win,.padS .ticks,.padS .rec{align-self:center}
.padS .screen,.padS .ticket,.padS .rec,.padS .tick{text-align:left}
.padS .tFoot{text-align:center}

/* callout ---------------------------------------------------------------- */
.tap{position:absolute;width:150px;height:150px;border-radius:50%;
  border:3px solid ${C.primary};opacity:.5}
.tapDot{position:absolute;width:30px;height:30px;border-radius:50%;background:${C.fg};opacity:.85;box-shadow:0 0 0 10px rgba(243,241,209,.18)}
.tap2{position:absolute;width:250px;height:250px;border-radius:50%;
  border:2px solid ${C.primary};opacity:.22}
.zoom{border-radius:30px;padding:26px 32px;display:flex;align-items:center;
  justify-content:space-between;background:${C.primary};
  box-shadow:0 30px 70px rgba(0,0,0,.55)}
.zoom span:first-child{font-family:Galdern;font-weight:800;font-size:40px}
.zoom span:last-child{font-family:GaldernM;font-weight:500;font-size:40px}

/* ticket ----------------------------------------------------------------- */
.ticket{width:520px;border-radius:40px;background:${C.surface};
  box-shadow:0 60px 110px rgba(0,0,0,.65), 0 0 0 1.5px rgba(243,241,209,.1);
  overflow:hidden;position:relative}
.tHead{display:flex;align-items:center;justify-content:space-between;
  padding:28px 34px;background:${C.raised}}
.tOk{font-family:GaldernM;font-weight:500;font-size:19px;letter-spacing:.1em;
  text-transform:uppercase;color:${C.accent};border:1.5px solid ${C.accent}66;
  border-radius:999px;padding:6px 14px}
.tBody{padding:30px 34px 22px}
.tBody h4{font-family:Galdern;font-weight:800;font-size:42px;margin:0 0 12px;line-height:1.02}
.tBody p{margin:0;font-size:24px;color:${C.muted};line-height:1.4}
.perf{height:2px;margin:6px 34px;border-top:3px dashed rgba(243,241,209,.18)}
.tQr{display:flex;justify-content:center;padding:26px 0 8px}
.tQr img{width:250px;height:250px;border-radius:14px;
  box-shadow:0 0 0 16px ${C.fg}}
.tFoot{text-align:center;font-size:21px;color:${C.muted};margin:26px 34px 34px}

/* chain (artist card 2) --------------------------------------------------- */
.chainRow{display:flex;flex-wrap:nowrap;align-items:center;gap:10px;width:fit-content;align-self:flex-start;
  margin-bottom:18px}
.chip{border-radius:16px;padding:14px 20px;font-size:26px;background:${C.raised};
  color:${C.muted};border:1px solid rgba(243,241,209,.09);white-space:nowrap}
.chev{font-size:26px;color:${C.muted};opacity:.6}
.strike{position:relative}
.strike::after{content:"";position:absolute;left:-14px;right:-14px;top:52%;height:4px;
  background:${C.primary};transform:rotate(-1deg);border-radius:3px;opacity:.9}
.win{margin-top:44px;align-self:flex-start;display:inline-flex;align-items:center;gap:18px;border-radius:22px;
  padding:22px 30px;background:${C.primary};font-family:Galdern;font-weight:800;font-size:38px}

/* receipt (artist card 4) ------------------------------------------------- */
.rec{flex:none;width:790px;border-radius:36px;background:${C.surface};padding:44px 48px;
  box-shadow:0 50px 100px rgba(0,0,0,.6), 0 0 0 1.5px rgba(243,241,209,.1)}
.row{display:flex;justify-content:space-between;align-items:baseline;
  font-size:32px;padding:18px 0;color:${C.muted}}
.row b{font-family:GaldernM;font-weight:500;color:${C.fg};font-size:34px}
.row.big{border-top:2px solid rgba(243,241,209,.12);margin-top:12px;padding-top:26px;
  color:${C.fg};font-size:36px}
.row.big b{font-family:Galdern;font-weight:800;font-size:52px;color:${C.accent}}

.ticks{margin-top:52px;display:flex;flex-direction:column;gap:22px}
.tick{display:flex;align-items:center;gap:18px;font-size:30px;color:${C.fg}}
.tickBox{width:42px;height:42px;flex:none;border-radius:12px;background:${C.accent}22;
  border:1.5px solid ${C.accent}66;display:flex;align-items:center;justify-content:center;
  color:${C.accent}}

/* closing card ------------------------------------------------------------ */
.centre{align-items:center;justify-content:center;text-align:center}
.btn{margin-top:44px;border-radius:999px;padding:26px 56px;background:${C.primary};
  font-family:Galdern;font-weight:800;font-size:40px;letter-spacing:.01em}
.url{margin-top:30px;font-family:GaldernM;font-weight:500;font-size:30px;
  letter-spacing:.06em;color:${C.muted}}
`;

function page(body) {
  return `<!doctype html><meta charset="utf-8"><style>${CSS}</style><div class="card">${body}</div>`;
}

// 1080x1920 for the Stories / Reels placement. Everything lives inside the
// safe box (280px clear at the top, 340px at the bottom) so Instagram's own
// chrome - avatar, caption, CTA bar - never lands on the copy.
function storyPage(body) {
  return `<!doctype html><meta charset="utf-8"><style>${CSS}
html,body,.card{height:1920px}
.dots{left:0;right:0;bottom:190px;justify-content:center}</style><div class="card">${body}</div>`;
}

/* -------------------------------------------------------------- mock gigs */

const gigsBy = {
  en: [
    { seed: 3, tint: C.primary, artist: "NOVA GRIS", likes: "412", tag: "Artist reel",
      title: "Nova Gris", venue: "Sala Nébula, Madrid", date: "Fri 5 Sep", time: "21:30",
      caption: "New song tonight 👀", cta: "Get tickets", price: "€12",
      tabs: ["For you", "Explore", "Saved", "Profile"] },
    { seed: 8, tint: C.accent, artist: "Marea Baja", likes: "268", tag: "Artist reel",
      title: "Marea Baja", venue: "Club Volcán, Lavapiés", date: "Sat 6 Sep", time: "22:00",
      caption: "Soundcheck from last night 🎸", cta: "Get tickets", price: "€9",
      tabs: ["For you", "Explore", "Saved", "Profile"] },
  ],
  es: [
    { seed: 3, tint: C.primary, artist: "NOVA GRIS", likes: "412", tag: "Reel del artista",
      title: "Nova Gris", venue: "Sala Nébula, Madrid", date: "Vie 5 Sep", time: "21:30",
      caption: "Tema nuevo esta noche 👀", cta: "Conseguir entradas", price: "12 €",
      tabs: ["Para ti", "Explorar", "Guardados", "Perfil"] },
    { seed: 8, tint: C.accent, artist: "Marea Baja", likes: "268", tag: "Reel del artista",
      title: "Marea Baja", venue: "Club Volcán, Lavapiés", date: "Sáb 6 Sep", time: "22:00",
      caption: "Prueba de sonido de anoche 🎸", cta: "Conseguir entradas", price: "9 €",
      tabs: ["Para ti", "Explorar", "Guardados", "Perfil"] },
  ],
};

/* ------------------------------------------------------------------ copy */

const COPY = {
  fan: {
    en: {
      c1: { h: `A for-you page<br>for <em>local gigs</em>`, s: `Reels from independent artists playing near you — not a wall of listings.`, cue: "Swipe",
            alts: [
              { h: `What are you<br>doing <em>tonight?</em>`, s: `Reels from artists playing near you, and the ticket in the same swipe.` },
              { h: `Stop searching<br>for gigs.<br><em>Swipe them.</em>`, s: `Independent artists near you, one reel at a time.` },
            ] },
      c2: { h: `Reels,<br>not <em>listings</em>`, s: `Hear the band before you buy the ticket.` },
      c3: { h: `Buy in the<br><em>same swipe</em>`, s: `Tap the price, pay, done. No second website, no sign-up chain, no email hunt.`, zoom: "Get tickets", zoomP: "€12" },
      c4: { h: `The ticket<br>stays <i>in the app</i>`, s: `Your QR is waiting on your phone. Nothing to print, nothing to dig out of your inbox.`,
            t: { status: "Valid", title: "Nova Gris", venue: "Sala Nébula, Madrid", date: "Fri 5 Sep", time: "21:30", foot: "Show this QR at the door" } },
      c5: { h: `Live music,<br><em>right near you</em>`, s: `Free to join. Find tonight's gig in the time it takes to scroll one reel.`, btn: "Open MadGigz" },
    },
    es: {
      c1: { h: `Tu «para ti»,<br>pero de <em>conciertos</em>`, s: `Reels de artistas independientes que tocan cerca de ti. No un muro de listados.`, cue: "Desliza",
            alts: [
              { h: `¿Qué haces<br><em>esta noche?</em>`, s: `Reels de artistas que tocan cerca de ti, y la entrada en el mismo scroll.` },
              { h: `Deja de buscar<br>conciertos.<br><em>Deslízalos.</em>`, s: `Artistas independientes cerca de ti, un reel a la vez.` },
            ] },
      c2: { h: `Reels,<br>no <em>listados</em>`, s: `Escucha al grupo antes de comprar la entrada.` },
      c3: { h: `Compra en el<br><em>mismo scroll</em>`, s: `Tocas el precio, pagas y ya está. Sin otra web, sin cadena de registros, sin buscar el email.`, zoom: "Conseguir entradas", zoomP: "12 €" },
      c4: { h: `La entrada<br>se queda <i>en la app</i>`, s: `Tu QR te espera en el móvil. Nada que imprimir, nada que rescatar del correo.`,
            t: { status: "Válida", title: "Nova Gris · Bolo tardío", venue: "Sala Nébula, Madrid", date: "Vie 5 Sep", time: "21:30", foot: "Enseña este QR en la puerta" } },
      c5: { h: `Música en directo,<br><em>aquí al lado</em>`, s: `Gratis. Encuentra el bolo de esta noche en lo que tardas en ver un reel.`, btn: "Abrir MadGigz" },
    },
  },
  artist: {
    en: {
      c1: { k: "For independent artists", h: `Sell your gig<br>where your fans<br><em>already scroll</em>`, s: `Upload the show, link the reels, sell the tickets.`, cue: "Swipe",
            alts: [
              { h: `How many fans<br>do you lose in the<br><em>link in bio?</em>`, s: `Every extra tap between the reel and the ticket costs you a sale.` },
              { h: `Your next gig,<br>sold <em>from a reel</em>`, s: `The show, the clip, the ticket all inside the feed.` },
            ] },
      c2: { k: "The problem", h: `The chain that<br><em>loses you fans</em>`,
            chain: ["post", "link in bio", "ticket site", "sign-up", "email"], win: "MadGigz — one tap, in the feed", win2: "The reel, the show and the ticket in one place — the fan never leaves the app." },
      c3: { k: "No gatekeeper", h: `No curation<br><em>gate</em>`, s: `Any artist can list — nobody decides you're not big enough yet.`,
            list: ["No waiting list", "No exclusivity", "Live in minutes"] },
      c4: { k: "Our cut, in the open", h: `5% — and we<br><em>say it out loud</em>`,
            rows: [["Ticket price you set", "€12.00"], ["MadGigz fee (5% + VAT)", "−€0.73"]],
            total: ["You receive", "€11.27"],
            foot: `No listing fee, no exclusivity — keep selling through your own links too. (5% + VAT, minimum €0.36 per ticket)` },
      c5: { h: `List your first<br>gig <em>free</em>`, s: `Set up in minutes, paid straight to your account after the show.`, btn: "Start selling" },
    },
    es: {
      c1: { k: "Para artistas independientes", h: `Vende tu bolo<br>donde tus fans<br><em>ya hacen scroll</em>`, s: `Sube el concierto, enlaza los reels y vende las entradas.`, cue: "Desliza",
            alts: [
              { h: `¿Cuántos fans<br>pierdes en el<br><em>link en bio?</em>`, s: `Cada toque de más entre el reel y la entrada te cuesta una venta.` },
              { h: `Tu próximo bolo,<br>vendido <em>desde un reel</em>`, s: `El concierto, el clip, la entrada: todo dentro del feed.` },
            ] },
      c2: { k: "El problema", h: `La cadena que<br><em>te cuesta fans</em>`,
            chain: ["post", "link en bio", "web de entradas", "registro", "email"], win: "MadGigz — un toque, en el feed", win2: "El reel, el concierto y la entrada en el mismo sitio: el fan no sale de la app." },
      c3: { k: "Sin porteros", h: `Sin filtro<br>de <em>curación</em>`, s: `Cualquier artista publica: nadie decide si eres «suficiente».`,
            list: ["Sin lista de espera", "Sin exclusividad", "Publicado en minutos"] },
      c4: { k: "Nuestra comisión, a la vista", h: `5% — y lo<br><em>decimos en alto</em>`,
            rows: [["Precio que pones tú", "12,00 €"], ["Comisión MadGigz (5% + IVA)", "−0,73 €"]],
            total: ["Tú recibes", "11,27 €"],
            foot: `Sin cuota por publicar y sin exclusividad: sigue vendiendo por tus propios enlaces. (5% + IVA, mínimo 0,36 € por entrada)` },
      c5: { h: `Publica tu primer<br>bolo <em>gratis</em>`, s: `Lo montas en minutos y cobras en tu cuenta después del concierto.`, btn: "Empezar a vender" },
    },
  },
};

/* ----------------------------------------------------------------- cards */

// Card 1 carries the whole carousel - it is the only card most people see - so
// it is factored out and rendered again for each alternative hook.
function fanHook(hook, cue, g1) {
  return page(`
    <div class="pad" style="width:668px">
      <img class="mark" src="${WM}">
      <h1 style="margin-top:56px;font-size:86px">${hook.h}</h1>
      <p class="sub" style="max-width:11.5em">${hook.s}</p>
      ${swipeCue(cue)}
    </div>
    ${phone(reelScreen(g1), "right:-14px;top:214px;transform:rotate(-7deg) scale(.8);transform-origin:top right")}
    ${dots(0)}`);
}

function artistHook(hook, kicker, cue, g1) {
  return page(`
    <div class="pad" style="width:660px">
      <img class="mark" src="${WM}">
      <p class="kicker" style="margin-top:52px">${kicker}</p>
      <h1 style="font-size:72px">${hook.h}</h1>
      <p class="sub" style="max-width:11.5em">${hook.s}</p>
      ${swipeCue(cue)}
    </div>
    ${phone(reelScreen(g1), "right:6px;top:256px;transform:rotate(-6deg) scale(.72);transform-origin:top right")}
    ${dots(0)}`);
}

function fanCards(lang) {
  const t = COPY.fan[lang];
  const [g1, g2] = gigsBy[lang];
  const cards = [];

  // 1 — hook
  cards.push(fanHook(t.c1, t.c1.cue, g1));

  // 2 — two reels
  cards.push(page(`
    <div class="pad">
      <img class="mark" src="${WM}">
      <h1 style="margin-top:44px">${t.c2.h}</h1>
      <p class="sub">${t.c2.s}</p>
    </div>
    ${phone(reelScreen(g2), "left:38px;top:520px;transform:rotate(-9deg) scale(.62);transform-origin:top left")}
    ${phone(reelScreen(g1), "right:56px;top:452px;transform:rotate(5deg) scale(.68);transform-origin:top right")}
    ${dots(1, "bottom:auto;top:474px")}`));

  // 3 — buy in the same swipe
  cards.push(page(`
    ${phone(reelScreen(g1), "left:16px;top:126px;transform:rotate(4deg) scale(.84);transform-origin:top left")}
    <div class="tap" style="left:106px;top:726px"></div>
    <div class="tapDot" style="left:166px;top:786px"></div>
    <div class="tap2" style="left:56px;top:676px"></div>
    <div style="position:absolute;right:72px;top:150px;width:566px;z-index:6">
      <h1 style="font-size:86px">${t.c3.h}</h1>
      <p class="sub" style="max-width:100%">${t.c3.s}</p>
      <div class="zoom" style="margin-top:60px"><span>${t.c3.zoom}</span><span>${t.c3.zoomP}</span></div>
    </div>
    ${dots(2)}`));

  // 4 — ticket
  cards.push(page(`
    <div class="pad" style="width:500px">
      <img class="mark" src="${WM}">
      <h1 style="margin-top:44px;font-size:80px">${t.c4.h}</h1>
      <p class="sub" style="max-width:100%">${t.c4.s}</p>
    </div>
    <div style="position:absolute;right:44px;top:322px;transform:rotate(4deg) scale(.88);transform-origin:top right">
      ${ticketCard(t.c4.t)}
    </div>
    ${dots(3)}`));

  // 5 — close
  cards.push(page(`
    <div class="pad centre">
      <img src="${WM}" style="width:560px">
      <h1 style="margin-top:64px;font-size:88px;text-align:center">${t.c5.h}</h1>
      <p class="sub" style="text-align:center;max-width:17.5em">${t.c5.s}</p>
      <div class="btn">${t.c5.btn}</div>
      <div class="url">${URL_SITE}</div>
    </div>
    ${dots(4)}`));

  return cards;
}

function artistCards(lang) {
  const t = COPY.artist[lang];
  const [g1] = gigsBy[lang];
  const cards = [];

  cards.push(artistHook(t.c1, t.c1.k, t.c1.cue, g1));

  cards.push(page(`
    <div class="pad">
      <img class="mark" src="${WM}">
      <p class="kicker" style="margin-top:56px">${t.c2.k}</p>
      <h1>${t.c2.h}</h1>
      <div style="margin-top:72px">
        ${chainRow(t.c2.chain.slice(0, 3), false)}
        ${chainRow(t.c2.chain.slice(3), true)}
      </div>
      <div class="win" style="margin-top:56px">${t.c2.win}</div>
      <p class="sub" style="max-width:18em">${t.c2.win2}</p>
    </div>
    ${dots(1)}`));

  cards.push(page(`
    <div class="pad" style="width:620px">
      <img class="mark" src="${WM}">
      <p class="kicker" style="margin-top:56px">${t.c3.k}</p>
      <h1 style="font-size:96px">${t.c3.h}</h1>
      <p class="sub" style="max-width:100%">${t.c3.s}</p>
      <div class="ticks">${t.c3.list.map((x) => `<div class="tick"><span class="tickBox"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4 10-10"/></svg></span>${x}</div>`).join("")}</div>
    </div>
    ${phone(reelScreen(g1), "right:10px;top:300px;transform:rotate(-8deg) scale(.68);transform-origin:top right")}
    ${dots(2)}`));

  const rowsHtml = t.c4.rows.map(([l, r]) => `<div class="row"><span>${l}</span><b>${r}</b></div>`).join("");
  cards.push(page(`
    <div class="pad">
      <img class="mark" src="${WM}">
      <p class="kicker" style="margin-top:48px">${t.c4.k}</p>
      <h1 style="font-size:84px">${t.c4.h}</h1>
      <div class="rec" style="margin-top:48px">
        ${rowsHtml}
        <div class="row big"><span>${t.c4.total[0]}</span><b>${t.c4.total[1]}</b></div>
      </div>
      <p class="sub" style="font-size:26px;max-width:24em;margin-top:30px">${t.c4.foot}</p>
    </div>
    ${dots(3)}`));

  cards.push(page(`
    <div class="pad centre">
      <img src="${WM}" style="width:560px">
      <h1 style="margin-top:64px;font-size:88px;text-align:center">${t.c5.h}</h1>
      <p class="sub" style="text-align:center;max-width:17.5em">${t.c5.s}</p>
      <div class="btn">${t.c5.btn}</div>
      <div class="url">${URL_SITE}</div>
    </div>
    ${dots(4)}`));

  return cards;
}


/* --------------------------------------------------------- stories (9:16) */

function fanStoryCards(lang) {
  const t = COPY.fan[lang];
  const [g1, g2] = gigsBy[lang];
  const tap = `<div class="tap" style="left:148px;top:413px;z-index:4"></div>
    <div class="tap2" style="left:98px;top:363px;z-index:4"></div>
    <div class="tapDot" style="left:208px;top:473px;z-index:4"></div>`;

  return [
    storyPage(`<div class="padS">
      <img src="${WM}" style="height:46px">
      <h1 style="margin-top:54px;font-size:84px">${t.c1.h}</h1>
      <p class="sub">${t.c1.s}</p>
      ${swipeCue(t.c1.cue)}
      <div style="margin-top:56px">${phoneWindow(reelScreen(g1), 700)}</div>
    </div>${dots(0)}`),

    storyPage(`<div class="padS">
      <h1 style="font-size:88px">${t.c2.h}</h1>
      <p class="sub">${t.c2.s}</p>
      <div style="margin-top:64px;display:flex;gap:26px;align-items:flex-end">
        ${phoneWindow(reelScreen(g2), 600, "transform:rotate(-5deg) scale(.86);transform-origin:bottom right")}
        ${phoneWindow(reelScreen(g1), 680, "transform:rotate(4deg) scale(.86);transform-origin:bottom left")}
      </div>
    </div>${dots(1)}`),

    storyPage(`<div class="padS">
      <h1 style="font-size:84px">${t.c3.h}</h1>
      <p class="sub">${t.c3.s}</p>
      <div style="margin-top:56px">${phoneWindow(reelScreen(g1), 700, "", tap)}</div>
    </div>${dots(2)}`),

    storyPage(`<div class="padS">
      <img src="${WM}" style="height:46px">
      <h1 style="margin-top:48px;font-size:82px">${t.c4.h}</h1>
      <p class="sub">${t.c4.s}</p>
      <div style="margin-top:56px">${ticketCard(t.c4.t)}</div>
    </div>${dots(3)}`),

    storyPage(`<div class="padS">
      <img src="${WM}" style="width:600px">
      <h1 style="margin-top:70px;font-size:86px">${t.c5.h}</h1>
      <p class="sub" style="max-width:17.5em">${t.c5.s}</p>
      <div class="btn">${t.c5.btn}</div>
      <div class="url">${URL_SITE}</div>
    </div>${dots(4)}`),
  ];
}

function artistStoryCards(lang) {
  const t = COPY.artist[lang];
  const [g1] = gigsBy[lang];

  return [
    storyPage(`<div class="padS">
      <img src="${WM}" style="height:46px">
      <p class="kicker" style="margin-top:44px">${t.c1.k}</p>
      <h1 style="font-size:76px">${t.c1.h}</h1>
      <p class="sub">${t.c1.s}</p>
      ${swipeCue(t.c1.cue)}
      <div style="margin-top:52px">${phoneWindow(reelScreen(g1), 600)}</div>
    </div>${dots(0)}`),

    storyPage(`<div class="padS">
      <p class="kicker">${t.c2.k}</p>
      <h1 style="font-size:84px">${t.c2.h}</h1>
      <div style="margin-top:76px">
        ${chainRow(t.c2.chain.slice(0, 3), false)}
        ${chainRow(t.c2.chain.slice(3), true)}
      </div>
      <div class="win" style="margin-top:60px">${t.c2.win}</div>
      <p class="sub" style="max-width:17em">${t.c2.win2}</p>
    </div>${dots(1)}`),

    storyPage(`<div class="padS">
      <p class="kicker">${t.c3.k}</p>
      <h1 style="font-size:92px">${t.c3.h}</h1>
      <p class="sub" style="max-width:17em">${t.c3.s}</p>
      <div class="ticks">${t.c3.list
        .map(
          (x) =>
            `<div class="tick"><span class="tickBox"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4 10-10"/></svg></span>${x}</div>`
        )
        .join("")}</div>
      <div style="margin-top:60px">${phoneWindow(reelScreen(g1), 460)}</div>
    </div>${dots(2)}`),

    storyPage(`<div class="padS">
      <p class="kicker">${t.c4.k}</p>
      <h1 style="font-size:80px">${t.c4.h}</h1>
      <div class="rec" style="margin-top:56px;width:880px">
        ${t.c4.rows.map(([l, r]) => `<div class="row"><span>${l}</span><b>${r}</b></div>`).join("")}
        <div class="row big"><span>${t.c4.total[0]}</span><b>${t.c4.total[1]}</b></div>
      </div>
      <p class="sub" style="font-size:27px;max-width:24em;margin-top:34px">${t.c4.foot}</p>
    </div>${dots(3)}`),

    storyPage(`<div class="padS">
      <img src="${WM}" style="width:600px">
      <h1 style="margin-top:70px;font-size:86px">${t.c5.h}</h1>
      <p class="sub" style="max-width:17.5em">${t.c5.s}</p>
      <div class="btn">${t.c5.btn}</div>
      <div class="url">${URL_SITE}</div>
    </div>${dots(4)}`),
  ];
}

/* ------------------------------------------------------------------ render */

const jobs = [];
for (const lang of ["es", "en"]) {
  const [g1] = gigsBy[lang];
  fanCards(lang).forEach((html, i) => jobs.push([`fan-${lang}-${i + 1}`, html, 1080]));
  artistCards(lang).forEach((html, i) => jobs.push([`artist-${lang}-${i + 1}`, html, 1080]));

  // Alternative card 1s, to test the hook against the same cards 2-5.
  COPY.fan[lang].c1.alts.forEach((alt, i) =>
    jobs.push([`fan-${lang}-1${"bc"[i]}`, fanHook(alt, COPY.fan[lang].c1.cue, g1), 1080])
  );
  COPY.artist[lang].c1.alts.forEach((alt, i) =>
    jobs.push([
      `artist-${lang}-1${"bc"[i]}`,
      artistHook(alt, COPY.artist[lang].c1.k, COPY.artist[lang].c1.cue, g1),
      1080,
    ])
  );

  fanStoryCards(lang).forEach((html, i) => jobs.push([`stories/fan-${lang}-${i + 1}`, html, 1920]));
  artistStoryCards(lang).forEach((html, i) =>
    jobs.push([`stories/artist-${lang}-${i + 1}`, html, 1920])
  );
}
fs.mkdirSync(path.join(OUT, "stories"), { recursive: true });

for (const [name, html, height] of jobs) {
  const f = path.join(BUILD, `${name.replace("/", "-")}.html`);
  fs.writeFileSync(f, html);
  execFileSync(
    CHROME_BIN,
    [
      "--headless",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--window-size=1080,${height}`,
      "--virtual-time-budget=1500",
      `--screenshot=${path.join(OUT, name + ".png")}`,
      `file://${f}`,
    ],
    { stdio: "ignore" }
  );
  process.stdout.write(name + " ");
}
fs.rmSync(BUILD, { recursive: true, force: true });
console.log(`\n${jobs.length} creatives -> ${path.relative(ROOT, OUT)}`);
