# Move the app to madgigz.app (#235)

_Decided 23 Nov 2026: the app moves from `madgigz.aurasonic.es` to **`madgigz.app`**
(owned, registered at GoDaddy, currently parked). `aurasonic.es` stays as the
company's marketing site and auth domain (`auth.aurasonic.es` is Supabase's
custom domain and does **not** move). Sequel to `docs/go-live.md`, which did the
`.vercel.app → madgigz.aurasonic.es` hop; the same gotchas apply, plus the ones
that come from having installed apps and printed QR codes pointing at the old
host._

## What actually depends on the hostname

Found by grepping the repo for `madgigz.aurasonic.es` (23 Nov 2026):

| Where | What | Changes with |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` (Vercel env) | `siteOrigin()` → share links, OG `metadataBase`, sitemap, Stripe success/cancel/return URLs, door links, ticket emails | env var + redeploy (no code) |
| `capacitor.config.ts` `server.url` + its two `cap sync` copies (`ios/App/App/capacitor.config.json`, `android/.../assets/capacitor.config.json`) | the host the installed apps load | **native rebuild** |
| `capacitor-shell/index.html` `LIVE_URL` (+ 2 synced copies) | offline fallback's "retry" target | native rebuild |
| `ios/App/App/App.entitlements` `applinks:` | Universal Links host | native rebuild |
| `android/.../AndroidManifest.xml` `android:host` | App Links host | native rebuild |
| `/.well-known/apple-app-site-association`, `/.well-known/assetlinks.json` | served by route handlers on **whatever host hits them** — nothing to change | — |
| `supabase/email-templates/*.html` | logo `<img src>` | code + re-paste into Supabase |
| `src/lib/i18n/{en,es}.ts` `wall.wallImageFooter`, `wallShareUnsupported` | the domain printed on the poster-wall image and in copy | code |
| `src/app/admin/events/import/rehost-poster.ts` | importer User-Agent | code |
| `src/app/privacy/page.tsx` + `docs/legal/*` | privacy text names `madgigz.aurasonic.es/privacy` | code (+ lawyer-reviewed wording) |
| `scripts/build-promo-posters.mjs`, `scripts/build-ig-carousel.mjs` | QR/URL baked into future posters | code (old printed QRs rely on the redirect) |
| `docs/store-listings.md`, `docs/play-launch-checklist.md` | Support / Marketing / Privacy URLs in App Store Connect + Play Console | dashboards, at next store submission |
| Cloudflare Turnstile → Hostname Management | signup captcha only runs on allow-listed hosts (error `110200` otherwise) | dashboard |
| Supabase → Auth → URL Configuration | Site URL + Redirect URLs | dashboard |
| Stripe → Webhooks endpoint URL | webhooks **POST**; a 308 from the old host is not followed | dashboard, before the old host redirects |
| Odoo "Abrir MadGigz" button (`aurasonic.es`) | forwards UTMs into the app | Odoo, any time after Phase 1 |
| Google Search Console | property + Change of Address | after the redirect is on |

Not affected: Google / Apple OAuth (their redirect URI is Supabase's
`auth.aurasonic.es/auth/v1/callback`), the Sign in with Apple Services ID,
Resend's sending domain (`notifications@aurasonic.es` — keep for now; moving
sender to `@madgigz.app` is its own job with DKIM/SPF/DMARC on the new domain),
Supabase Storage URLs, staging (stays on its Vercel preview URL throughout).

## The trap: don't redirect the old host until the native builds have moved

The installed iOS/Android apps load `https://madgigz.aurasonic.es` as
`server.url`. If that host starts answering **308 → madgigz.app**, the WKWebView
follows it onto a host that is not its configured origin, and Capacitor treats
that as an external navigation (same mechanism that needed `*.stripe.com` in
`allowNavigation`, #131): the app breaks or kicks out to the browser for every
user who hasn't updated. Universal/App Links to `madgigz.app` also don't open the
app until a build carries `applinks:madgigz.app`.

So the move is **add, then rebuild, then redirect** — three phases, with both
hosts serving the app in between. `.app` is an HSTS-preloaded TLD (HTTPS only,
always); Vercel's auto-certificate covers it, nothing to do.

Web users lose their session once at cutover (the auth cookie is per-origin) and
sign in again. Acceptable; say so in the release note.

## Phase 0 — code, ships before anything is pointed anywhere (me)

**On prod since 23 Nov 2026** (`a0af8e7`). All safe to deploy: nothing changes behaviour
until the domain exists.

0. Stripe return URLs (checkout success/cancel, Connect onboarding), door links
   and pro invite links are built from the **request's own host**
   (`src/lib/request-origin.ts`), not `NEXT_PUBLIC_APP_URL`. This is what makes
   the dual-host period safe: a fan on either host pays and comes back to the
   same host, with their session. The host is allow-listed (madgigz.app,
   *.aurasonic.es, *.vercel.app, localhost) and falls back to the canonical one.

1. Replace the hardcoded `madgigz.aurasonic.es` in code with `madgigz.app`
   (email-template logos, importer User-Agent, poster scripts). The poster-wall
   footer strings in the i18n catalog are left for the pretty-URL work, which
   reworks the share surfaces anyway.
2. Native config: `server.url`, `LIVE_URL`, entitlements and manifest → add the
   new host. Keep `applinks:madgigz.aurasonic.es` and the old Android
   `android:host` **as well** so links already in the wild still deep-link.
   Add `madgigz.aurasonic.es` to `allowNavigation` as a belt-and-braces for any
   redirect that reaches a new build. Takes effect only at the next `cap sync` +
   rebuild (Phase 2) — batch with other native work.
3. Privacy page / legal texts: say the policy lives at `madgigz.app/privacy`
   (and still at the old URL). Flag to the lawyer with the next batch of edits
   (#210), not a blocker.
4. `docs/store-listings.md` + `play-launch-checklist.md`: new URLs.
5. `npm run check`, staging, promote.

## Phase 1 — both hosts live, new one canonical (you, dashboards)

1. **Vercel → project → Settings → Domains → Add** `madgigz.app` and
   `www.madgigz.app` (set www to redirect to the apex; Vercel offers this).
   Vercel shows the DNS records: an **A** record for the apex and a **CNAME** for
   `www`. Use exactly what it shows.
2. **GoDaddy → madgigz.app → DNS**: delete the parking A records
   (`13.248.243.5`, `76.223.105.230`) and GoDaddy's forwarding; add Vercel's A
   (`@`) and CNAME (`www`). Valid in Vercel within minutes–an hour.
3. **Vercel env, Production scope**: `NEXT_PUBLIC_APP_URL = https://madgigz.app`.
   Then **Redeploy with build cache OFF** (`NEXT_PUBLIC_*` is inlined at build).
4. **Supabase prod → Authentication → URL Configuration**: Site URL
   `https://madgigz.app`; Redirect URLs **add** `https://madgigz.app/**`. Keep
   the old entries and `madgigz://**`.
5. **Cloudflare → Turnstile → the widget → Hostname Management**: add
   `madgigz.app`. Keep the old host and `localhost`.
6. Re-paste the two email templates (Phase 0 changed the logo URL).

Verify: `https://madgigz.app/api/health` → `appUrl` is the new domain, same
`commit` as prod; Google sign-in round-trips; Share on a show gives a
`madgigz.app/e/…` link; email signup on the new host completes (Turnstile);
`https://madgigz.aurasonic.es` **still serves the app** (no redirect yet);
`curl -s https://madgigz.app/.well-known/apple-app-site-association` lists the
app when `APPLE_TEAM_ID` is set.

## Phase 2 — native rebuild on the new host

`npx cap sync`, Xcode + Android Studio builds, on-device test of: cold launch,
offline launch, a `madgigz.app/e/…` link opening in-app, Google/Apple sign-in
returning. Submit with the new Support / Marketing / Privacy URLs
(`docs/store-listings.md`). Then wait for adoption — a couple of weeks of
Phase 1 steady state costs nothing.

## Phase 3 — old host becomes a redirect

Only after Phase 2 builds are the ones most users run:

1. **Stripe → Developers → Webhooks**: change the endpoint URL to
   `https://madgigz.app/api/stripe/webhook` (same signing secret, same events).
   Confirm one test event is received **before** step 2.
2. **Vercel → Domains → `madgigz.aurasonic.es`** → Redirect to `madgigz.app`,
   **308** (keeps the path, so old `/e/<id>` links and printed QR codes land on
   the right show).
3. **Google Search Console**: add the `madgigz.app` property, submit
   `/sitemap.xml`, then run **Change of Address** from the old property (#212
   follow-up).
4. **Odoo**: point the "Abrir MadGigz" button at `https://madgigz.app/?utm_…`.
5. Re-generate any poster/carousel assets still being printed.

Verify after: `curl -sI https://madgigz.aurasonic.es/e/x` → `308` with
`location: https://madgigz.app/e/x`; a Stripe test purchase on prod fulfils
(the webhook is reaching the new host); the Phase 2 app still launches.

## Later, separately

- Sender on `@madgigz.app` (Resend domain + DKIM/SPF/DMARC; also the Apple
  Private Relay registration — see the Apple Private Relay notes).
- `info@`/`support@madgigz.app` inboxes, then the legal texts' contact lines.
- Bundle id stays `es.aurasonic.madgigz` — changing it means a new App Store
  listing. Don't.
