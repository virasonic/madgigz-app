# MadGigz backlog

Open items only. Anything not listed here has shipped — see `git log`.

Numbering is historical and deliberately not re-packed, so a number always means
the same thing across old conversations. Gaps are shipped items.

## In suggested order

| Order | # | Item | What the work actually is | Blocked on | Size |
|---|---|---|---|---|---|
| ✅ | 82b | **Apple sign-in** | **Shipped to prod 12 Aug 2026** — the day Apple approved the developer verification. Apple provider configured in Supabase (Services ID `es.aurasonic.madgigz.web`, `.p8` key, return URL on the new custom domain `auth.aurasonic.es/auth/v1/callback`); `AppleButton` added (mirrors `GoogleButton`, provider `apple`, inlined monochrome Apple mark), placed **above** Google on signin + signup per Apple's HIG, flowing through the same provider-agnostic `/auth/callback` 82a built. Verified: authorize endpoint redirects to `appleid.apple.com` with the right client_id + callback. Strings `signin/signup.withApple` (en+es). **Maintenance:** the Apple client secret is a JWT that expires ~180 days — see [[125]] (rotate ~Feb 2027) or it silently breaks. | Done. | S |
| 2 | 111 | **Mass gig upload / gig-database import** | A bulk path to add many gigs at once instead of the one-at-a-time Add Show form — a CSV/spreadsheet (or paste) import that creates a batch of `events` rows. Natural home is the admin panel: admin-created house shows already model an event with no `artist_id` owned by its creator (#62 precedent), so importing is the same shape at scale. The work: an upload UI (admin now; a promoter later, #88), a column mapping (title, venue, date, time, price, city, category, poster), **per-row validation with a dry-run preview before anything is written**, venue matching against existing `venues` rows (create-or-link, never duplicate), and a dedup key so re-uploading the same list doesn't double-post. Feeds the soft-launch directly — an app full of real Madrid gigs grows; an empty one doesn't. | Nothing technical. Needs a source of gig data (a spreadsheet/feed) and a call on who owns imported shows. | M |
| 2 | 118 | **Seed real Madrid shows from Bandsintown** | Populate the app with genuine upcoming gigs by pulling Bandsintown listings **filtered to our `venues`** (Sala But, La Riviera, Caracol, El Sol, Siroco, Clamores, WiZink…), capturing what a listing carries: **external ticket link, description, line-up, price, date/time, poster**. These land as **external-ticketing events** (`ticketing_mode = 'external'`, no payout/checkout — the existing admin-created + external-link model, #62), owned by no artist, city = Madrid (#90). Ingestion should **reuse the #111 mass-import path** (per-row validation, venue create-or-link, dedup key, dry-run preview), not a second bespoke pipeline. **The real decision is the source, and it's not a coding one:** Bandsintown has an **official API** (partner programme with its own terms) — that's the sanctioned route; scraping the site likely breaches their ToS, and re-hosting their posters/descriptions raises copyright (a ticket **link** is just a URL, fine to store). So prefer the API, attribute the source, and treat descriptions/images carefully. Needs a refresh/expiry story so listings don't go stale. | Bandsintown API access (or another ToS-safe source) + the #111 importer. | M |
| ✅ | 113 | **Move Log Out + Delete account into Settings** | **Shipped 12 Aug 2026.** On both fan and artist profiles, Log Out and Delete account moved off the profile body into the Settings sheet (`ProfileClient.tsx`) — Log Out a normal row, Delete account the quiet underlined control at the bottom; opening Delete closes Settings first so the dialog isn't stacked. | Done. | S |
| ✅ | 114 | **Show posters in the artist's shows lists** | **Shipped 12 Aug 2026.** The artist profile's "Your Shows" rows (`ShowRow`) — and the "Tagged in" rows — now lead with the show's poster thumbnail, so an artist recognises a show by its art instead of reading titles. | Done. | S |
| 4 | 115 | **Flesh out the fan profile** | Today a fan profile is just two stat numbers (Attended / Saved) — it feels empty. Give it real content. Leading candidate is the past-events poster wall (#116); could also surface followed artists and liked shows. **Vir to say what a fan should see there** — #116 is the concrete first piece. | Vir to pick the content. | S–M |
| 4 | 116 | **Past events as a poster wall (DICE-style)** | Show the **posters of shows the fan has attended** as a grid on their profile (the DICE "memories" pattern), rather than only a count. The past-events plumbing exists (#63 shipped a past-events function), so this is mainly the fan-facing display: query attended past events, render their posters in a grid, tap → the event/ticket. This is the natural answer to #115. | Nothing (data exists). | S–M |
| 8 | 117 | **Raise upload size / compress videos** | Now on Supabase Pro (~100GB storage / 250GB egress), the per-file cap (`MAX_CONTENT_FILE_BYTES = 50MB` in `src/lib/media.ts`, plus the bucket's `file_size_limit`) can be raised. **The real cost is egress, not storage** — every feed view re-streams a video, so a bigger file is paid for on every play and on fans' mobile data, which is why "just raise it" isn't free. Recommendation: bump the limit **modestly** now (cheap, unblocks bigger clips), but real **video compression** (transcode/downscale on upload) needs WebCodecs client-side or ffmpeg server-side — that's the **#99 in-app video editor**'s media pipeline, not a quick constant change. Images are already downscaled (#96); video is the gap. | Nothing to raise the cap. Compression rides with #99. | S (cap) · L (compression) |
| ✅ | 104 | **Claude skills for code organisation** | **Shipped 12 Aug 2026.** Four convention skills now live in `.claude/skills/` alongside `simulate-users`: **`db-migration`** (numbering, the public/owner/service column classification + column GRANTs, the two-phase revoke, the drop-policy-name trap, graceful degradation, the fresh-DB setup file, staging-then-prod, never `drop schema public`), **`i18n-string`** (en.ts → es.ts → `export-i18n-json.mjs` → review PDF, admin-English, `{var}` interpolation), **`adversarial-probe`** (the `scripts/*probe*.mjs` set + the read-the-value-back rule), and **`next-conventions`** (read the bundled Next docs, no module-scope env throw, no `useSyncExternalStore`, the setState-in-effect ban + escapes, realtime `setAuth`). Each is an invokable checklist grounded in the real files/scripts, so the tribal knowledge in CLAUDE.md is now applied the same way every time. | Done. | S |
| 7 | 105 | **Full web / desktop version** | **Foundation pass shipped to prod 11 Aug 2026** (TikTok-web model). At `lg` (≥1024px), the mobile phone column gives way to a real desktop shell — mobile is untouched below `lg`. What shipped: a responsive `(app)` shell (`layout.tsx`); a persistent left **`SideNav`** (wordmark + Feed/Explore/Tickets/Notifications/Profile, active states, live unread pill) replacing the bottom nav on desktop; a shared `nav-icons.tsx` so the two navs can't drift; the For You reel as a **centred, fully-visible 9:16 card** height-clamped to `min(100%, 26rem*16/9)` so it never re-crops as the window resizes (the original clip complaint); **desktop up/down arrow buttons** that snap one reel per click alongside trackpad scroll (`feed.previousReel/nextReel`, en+es); and sensible wide-screen widths elsewhere (Explore 4-col grid + max-w-5xl; Tickets/Profile/Notifications centred max-w-2xl). **Deferred follow-up (deep redesign):** bespoke per-tab desktop layouts — masonry/multi-column Explore, two-column profile, feed side-rails/next-up previews. Also still open: whether a separate **marketing site** on the apex `aurasonic.es` is wanted (that's the Odoo site's job, not this). | Deep redesign later, Vir's call. | M–L |
| 3 | 95 | **Go live — real payments (domain already shipped)** | **The domain is live (11 Aug 2026):** `madgigz.aurasonic.es` serves the app, `NEXT_PUBLIC_APP_URL` + Supabase redirect URLs are set, `/api/health` is green. **Stripe stays in test mode** for this soft launch — real signups/shows/browsing, test-mode checkout. What's left is the real-payments flip: live Stripe keys, a live webhook on the new URL + its signing secret, artists completing real Connect onboarding, and the IVA/tax question (#97) settled first. Runbook in `docs/go-live.md`. | Vir — flip when tax + payouts are ready. | M |
| 4 | 108 | **Pre-production / staging environment** | A second, hosted copy of the app to test big changes against a realistic stack *before* they touch live — because once #95 ships, "test it locally" stops being safe enough. A `staging` (or `preview`) Vercel deployment on its own subdomain, pointed at a **separate Supabase project** (its own DB, its own migrations run first) and **Stripe test mode**, driven by a `.env.staging`. Then the flow becomes: change → deploy to staging → exercise it (the `simulate-users` skill and the probes already take `--env=.env.staging`) → promote to prod. Ties into #103 (staging holds its own set of the same secrets) and gives the user-simulation harness the throwaway project it always wanted. | **Shipped 11 Aug 2026.** Locked staging Preview live at `madgigz-app-git-staging-aura-sonic.vercel.app` (Vercel Authentication) on its own Supabase (`hzuqhraoslgjibdcccyx`) + Stripe test; Google sign-in configured, Turnstile off on staging. One-paste `supabase/staging_full_setup.sql`, runbook `docs/staging.md`, and `/api/health` `supabaseHost` isolation check all in place. Lesson banked in the runbook: **never `drop schema public` to reset a Supabase project** — it wipes default grants and silently breaks writes; recreate the project instead (the first staging DB was rebuilt for exactly this). **Remaining (optional):** the Stripe test webhook needs a Protection-Bypass token to get past the login wall — do it when payment edge-cases need testing. | M |
| 4 | 90 | **City-centric — the app's core identity** | MadGigz is *local*: a fan sees shows in **their city only**, framed as "You're in Madrid — here's what's on". Launch is **Madrid only**, then cities are switched on **one at a time**. Groundwork is already there — `events.city` and `venues.city` both exist (default `'Madrid'`). The work: a "current city" the app knows (a launched-cities list + how the user's city is set — see note), feed/Explore/This-Week filtered to it, and the city named in the UI. **Later:** a fan can switch cities (travelling), and a touring artist can post shows in another city (venue picker not locked to one city). | **#90a shipped 11 Aug 2026:** the local-first framing — `src/lib/city.ts` (`CURRENT_CITY`), a single-city filter on the feed + Explore, and a "📍 Madrid" pill (en/es). **#90b remaining (deferred until city #2):** launched-cities list, per-user current city, and city switching — the multi-city machinery. | L (90b) |
| ✅ | 101 | **Live updates (Supabase realtime)** | **Shipped to prod 11 Aug 2026** (verified live on staging: two-account tests moved the bell dot and the ticket-sheet sold bar with no reload). `src/lib/realtime.ts` — `useLiveUnreadCount` (the profile-tab bell dot) and `useLiveEventStats` (the ticket sheet's sold bar / "Almost gone" / sold-out lock), wired into `BottomNav` and `TicketModal`, both seeded from the server-rendered value (no flash) and degrading to reload-to-refresh if realtime is off. `supabase/addendum_033_realtime.sql` adds `notifications` + `events` to the `supabase_realtime` publication (RLS unchanged — no new read access) and sets `notifications` to `replica identity full`. **The non-obvious fix:** the `@supabase/ssr` browser client doesn't push the cookie session to the realtime socket before subscribe, so the recipient-scoped bell got nothing — the hooks now `getSession()` + `realtime.setAuth()` before subscribing. Scope was deliberately the two numbers that mislead when stale, not "realtime everywhere". **Live on prod 11 Aug 2026** — `addendum_033` run on the prod Supabase, so the bell dot and the ticket-sheet sold count now push live for real users. | **Done.** | M |
| 6 | 110 | **Get on the app stores (Play Store first, App Store later)** | **PWA groundwork shipped 11 Aug 2026:** `public/sw.js` (conservative service worker — offline fallback, never caches authed HTML), `public/offline.html`, production-only registration, `/sw.js` headers, middleware exclusions. Verified installable (SW registers, scope `/`, activated). So the app is now installable + wrappable. **iOS shell (Capacitor) built 12 Aug 2026 — internal-TestFlight path:** because MadGigz is server-rendered (no static export), the app is a **Capacitor 8 shell that loads the live site** (`server.url = madgigz.aurasonic.es`) — no CocoaPods (Capacitor 8 uses SPM). Native OAuth bridge solves the webview-Google block (`disallowed_useragent`): `startOAuth`/`isNativeApp` (`src/lib/native.ts`) open Google/Apple in the **system browser** and return via a `madgigz://auth-callback` deep link that `NativeBridge` (mounted in the root layout) forwards to the existing `/auth/callback` — reusing the web routing, no duplication. Web path unchanged (guarded on `isNativeApp()`, verified: Apple/Google/email login all still work on web). Info.plist carries the `madgigz` URL scheme, `NSCameraUsageDescription` (QR scanner), portrait-lock; icon + branded splash generated from brand assets via `@capacitor/assets`. **Verified building + running:** `xcodebuild` succeeded (82s), the app launches in the iOS Simulator and loads the live landing/sign-in natively. **Chose internal-TestFlight first** (no Apple review) — Apple 4.2 rejects thin wrappers for the *public* store, so the native-feature work (push, Universal Links, native Sign in with Apple, etc.) is a deliberate later phase. **Remaining for a TestFlight build:** (you) add `madgigz://auth-callback` to Supabase Redirect URLs; (you) set the Xcode signing Team + create the App Store Connect record; Archive → upload → Internal Testing. **The site must be deployed with the native-bridge code for OAuth to work in the app** (the app loads prod's JS). **Still to do (public store):** It's a web app, so **wrap it, don't rebuild.** **Android / Google Play:** a TWA (Trusted Web Activity) — an Android shell around the PWA via PWABuilder or Bubblewrap → a signed AAB; needs `/.well-known/assetlinks.json` (Digital Asset Links) to verify the domain and drop the browser URL bar. **iOS / App Store:** harder — Apple guideline 4.2 rejects thin web wrappers, so it wants a Capacitor shell with enough native feel; waits on the Apple Developer account (#82b). **Already have:** web manifest (`src/app/manifest.ts`), full icon set incl. maskable, HTTPS, and in-app account deletion (Play requires it). **Gaps:** no **service worker** yet (installability + offline — `next-pwa` or hand-rolled); the Digital Asset Links file; a **public privacy-policy + web account-deletion URL** (Google now requires a web-facing deletion page, not just in-app); and store listings (screenshots, feature graphic, descriptions ×2 langs, content rating, Google Data-Safety / Apple privacy labels). **Fees:** Play Console **$25 one-time**, Apple Developer **$99/yr** (already needed for #82b). **The one real gotcha — payments:** the stores demand their 30% in-app purchase for *digital* goods, but **live-event tickets are a real-world service** (the Eventbrite/DICE exception), so Stripe checkout should be allowed — must be confirmed against current store policy, because a misclassification is a hard blocker. | Android: nothing technical (PWA service worker + the store paperwork). iOS: the Apple account (#82b). Not urgent for the soft launch — the PWA already installs via "Add to home screen"; do this before a marketing push, for discoverability + trust. | M (Android) · L–XL (iOS) |
| 7 | 88 | **Promoter & venue flows** | Account types alongside fan/artist, probably web rather than the app. Groundwork exists: admin-created shows already model a show with no `artist_id` managed by its creator, `venues` rows carry a `verified` flag an account could claim, and the artist claim-and-evidence flow is the precedent for verifying someone represents a venue. | Later, your call. Decide ownership first. | L |
| 8 | 92 | **Band infrastructure (artists ⇄ bands)** | **Artists are people, bands are groups**, and the link is **many-to-many**: an artist plays in several bands, a band has several artist members. So a band is its own profile-like entity (name, photo, socials, its own shows), joined to artist profiles through a `band_members` table (band_id, profile_id, role, share) — not a flag on a profile. Members keep their own artist accounts and appear under each band they're in; a band's shows can also surface on each member's profile. `event_artists` (`addendum_012`) is the precedent for profile↔event tagging, but this is profile↔band↔profile, a new entity and a new answer to "who owns this". Big feature, genuinely useful. The sharp edge is money, not the graph — see below. | Not now, by Vir's call. Design the payout model first. | XL |
| 9 | 58 | **Admin activity tracking** | Login frequency, geolocation, attendance history. A new events table and a write path, not just a query. | Nothing technical. Needs a purpose first. | L |
| 10 | 99 | **In-app video editor** | Trim, crop to vertical, add a music bed, maybe captions — so an artist can post from their phone without leaving for CapCut and coming back. Real scope: it is a media pipeline, not a screen. Browser-side trimming is doable with the WebCodecs API; anything more (music beds, transcode-on-upload) wants server-side ffmpeg, which Vercel's function limits make awkward. Music also needs a licensed library, which is a commercial deal, not code. | Nothing technical. Worth doing once artists are actually posting. | XL |
| 11 | 100 | **Supabase storage and bandwidth headroom** | Vir is happy to pay — this is about noticing *before* uploads start failing, not about avoiding the bill. Free tier is 1GB storage / 5GB egress; Pro is $25/mo for 100GB. The real lever was #96 — **shipped 11 Aug 2026:** `src/lib/image-resize.ts` downscales images (long edge → 1920px, re-encoded) inside `uploadEventMedia`, so posters, avatars and content photos shrink client-side before Storage (a 4000×3000 test image went 432KB → 133KB). Cuts both storage and egress. Still wants a size figure in the admin dashboard so the trend is visible. **Update 11 Aug 2026: Vir upgraded Supabase to Pro** — ~100GB storage / 250GB egress included, so the ceiling is far off; the per-file **upload size limit can also be raised now** (a bucket `file_size_limit` plus the client-side check, e.g. for artist video posts feeding #99). Drops to a low-priority watch + the admin size figure. **Admin size figure built 11 Aug 2026 (on `staging`):** the admin dashboard now has a **Storage** panel — total used vs the ~100GB Pro quota with a headroom bar, plus a per-bucket breakdown (files + size for `event-media`, `artist-evidence`). Powered by `supabase/addendum_034_storage_usage.sql` — a service-role-only `admin_storage_usage()` RPC that aggregates `storage.objects` (that table's in the `storage` schema, which PostgREST can't reach directly). Egress/bandwidth is a billing-only metric with no SQL source, so it stays in the Supabase dashboard; this is the file footprint, the part that only grows. Degrades gracefully (shows a "run addendum_034" note) until the migration runs. Verified on staging (addendum_034 run there); **code promoted to prod 11 Aug 2026**. **Done 12 Aug 2026: `addendum_034` run on prod**, so the admin Storage panel now shows real numbers. | ✅ Done. | S |
| ✅ | 109 | **Surface upload errors in the artist claim form** | **Shipped 11 Aug 2026.** `ArtistClaimForm.tsx` now wraps `uploadArtistEvidence` in try/catch — a rejected upload shows the error and logs the reason instead of leaving the button stuck on "submitting…". The silent-throw that masked the staging grant issue is gone. | Done. | S |
| 12 | 97 | **Tax & invoicing (facturación) — Odoo-backed** | Real euros mean IVA on the MadGigz fee, facturas artists can hand their accountant, and ticket-sales invoicing for house shows. **Refined 11 Aug 2026 (Vir, planning ahead — not building until the gestor signs off):** Odoo is the **invoice engine** (Invoicing app live, Spanish PGCE chart, "MadGigz service fee" 21%-IVA product, RPC via `tools/odoo/odoo.py`); MadGigz's job is **capturing fiscal identity + organisation data**, never generating a legal factura itself. Two distinct invoice flows and an open "where does capture live" fork — see the design note below. | **Gestor** — must sign off IVA treatment, invoice format, retención/IRPF, and Verifactu/SII obligations before any build. | L |
| 12 | 112 | **Sync registered users into Odoo CRM** | Push MadGigz's registered users into Odoo as contacts (`res.partner`) so the CRM/marketing base lives in one place, via the RPC tool `tools/odoo/odoo.py`. Source: Supabase `profiles` (username, role, created_at) joined to each `auth.users` email (service-role, server-side). Dedup on email. Decisions: a one-off **backfill** of existing users, plus an **ongoing sync on each new signup** (a hook/trigger), ideally both; and it **shares the `res.partner` model with #97's fiscal identities** — the two must reconcile to one contact per person, not duplicate partners. **GDPR:** names/emails are personal data, so moving them to Odoo for marketing needs a lawful basis (and Odoo becomes another processor); account deletion (`src/lib/account-deletion.ts`, `addendum_019`) must also remove/anonymise the Odoo contact, or the sync must be a deletion-aware one-way mirror. See [[odoo-instance]] and the #97 design note. | Lawful basis for marketing + backfill-vs-ongoing decision. | M |
| 13 | 98 | **In-house payments** | Replacing Stripe Connect with direct payment handling. **Much later, by Vir's note.** Would mean becoming a payment facilitator: PSD2/SCA, PCI scope, holding other people's money, and a licence. Stripe's 1.5% + €0.25 buys all of that. | Far future. Only worth it at real volume. | XL |
| 3 | 119 | **Terms & conditions (+ the legal pages)** | **Mostly shipped 12 Aug 2026.** The legal set lives on the Odoo site, bilingual: **`aurasonic.es/terms-of-service`** (general — organiser as seller, MadGigz as intermediary "en nombre y por cuenta ajena", the AuraSonic/MadGigz house-show carve-out where AuraSonic is the seller, refunds, no 14-day withdrawal per art. 103.l LGDCU, funds-custody-with-Stripe), **`/organiser-terms`** (organiser = venue/promoter/artist: 5% + €0.25 min + 21% IVA, monthly invoice, payout released after the show, own-taxes + DAC7 clause, cancellation shortfall top-up, verification-isn't-curation), and the existing **`/privacy`** — structure per the gestor's written answers (11 Aug). The app links them at the binding moments (`components/legal/LegalNotice.tsx` + `lib/legal.ts`, locale-aware URLs): signup + signin ("by continuing you agree…"), the artist claim form + switch-to-artist confirm (Organiser Terms), the ticket sheet's final-sale line (now names the organiser as seller + links the Terms — what makes the withdrawal exclusion bind), and a permanent Legal row in Settings. **Still open:** the lawyer's polish pass on the published wording; stored acceptance versioning (`accepted_terms_at` + re-consent on material changes) — deliberately deferred, the by-continuing pattern suffices for now; cookie notice (the app sets only functional cookies, so likely a one-liner — confirm with the lawyer). | Lawyer pass on the wording; acceptance versioning when terms first change materially. | M |
| ✅ | 120 | **Desktop: announcements panel beside the feed, triggered from the sidebar** | **Shipped to prod 12 Aug 2026.** On desktop the "From MadGigz" announcements moved off the bottom-sheet overlay: a first-class **`SideNav`** rail row (megaphone, between Feed and Explore) opens them as an **in-flow column to the left of the feed** — its own scroll + a × close button (no backdrop to tap) — which re-centres the reel in the remaining width, side by side rather than over the top. It reuses the URL-driven `?panel=announcements` state (#102), so the rail item is just a `Link`. Caught + fixed a clip: when the column is open the reel track narrows, so the prev/next arrows hold back to `xl` (they'd clip the viewport edge at `lg`); trackpad scroll is unaffected. **Mobile untouched** — header megaphone + bottom sheet stay (right for a phone). Mobile sheet and desktop column share one `AnnouncementsList` so they can't drift; new strings `feed.announcements` / `feed.closeAnnouncements` (en+es). | Done. | S–M |
| 7 | 121 | **Desktop: add-content panel opens on the right of the feed (mirror #120)** | The "+" post-an-update flow (`AddContentModal`) currently opens as a **centred web dialog** on desktop (shipped 12 Aug 2026 — cleaner than the old bottom sheet). Vir wants to go further: on desktop, open it as an **in-flow column on the *right* of the feed**, the mirror image of how #120 opens announcements on the left — so the reel re-centres and the post form sits beside it rather than over it. Reuse #120's pattern exactly: an in-flow `<aside>` (right border instead of left), its own scroll + × close, the reel arrows holding back to `xl` when it's open (the track narrows on that side too — the arrows live on the right, so watch the collision carefully; may need to hide them entirely when this panel is open). Keep the top-right "+" trigger. **Mobile untouched** — keeps the bottom sheet. Open question: with the panel URL-addressable (a `?compose=1`-style param, like `?panel=`) both the left announcements and right compose could theoretically be open at once — decide whether they're mutually exclusive. | Nothing — pure frontend, same pattern as #120. | S–M |
| 3 | 122 | **Google OAuth: publish to Production + brand the sign-in domain** | **(b) Brand the redirect host — SHIPPED to prod 12 Aug 2026.** The sign-in screens no longer read *"to continue to `rxtiagsypwvuyyihbhal.supabase.co`"* — the **prod** Supabase project now has a **Custom Domain** (`auth.aurasonic.es`, ~$10/mo add-on): CNAME on GoDaddy → Supabase Activate → Google OAuth client redirect URI added (`https://auth.aurasonic.es/auth/v1/callback`, old one kept) → `NEXT_PUBLIC_SUPABASE_URL` flipped to the custom domain (**Production scope only** — Preview stays on staging's Supabase, #108) → prod redeployed (`NEXT_PUBLIC_*` is build-time inlined, so the client bundle only switches on rebuild; server routes flip at runtime). Verified: `/api/health` `supabaseHost: auth.aurasonic.es`, authorize endpoint returns `redirect_uri=…auth.aurasonic.es/…`, app + REST 200 over the custom domain. Media-URL→path converters made host-agnostic (`storage.ts`, `account-deletion.ts`) so pre-cutover objects still resolve. Runbook in `docs/go-live.md`. Staging stays on `supabase.co`. **(a) Publish to Production — DONE 12 Aug 2026.** OAuth consent screen publishing status now reads **In production**, so any Google user can sign in (not just added test users). The sign-in screen correctly shows **`aurasonic.es`** as the destination; Google is separately reviewing the app *branding* (name/logo) — cosmetic and non-blocking, sign-in works meanwhile. | ✅ Both done. | ✅ |
| ✅ | 123 | **Show the artist's profile photo on feed reels** | **Shipped 12 Aug 2026.** The For You reel card (`ContentReelCard`) now shows the artist's real **profile picture** in the avatar circle (`<Image fill>`), falling back to the note icon only when there's no photo (or for a MadGigz announcement). `fetchContentPosts` + `fetchShowContent` embed it via the `content_posts.artist_id → profiles` FK (`select("*, profiles(artist_photo_url)")`); `ContentPost` carries `artistPhotoUrl`, set by `mapContentPost`. No new grant (`artist_photo_url` is already public-API-readable) and no migration. Verified: the live embed returns real photo URLs against prod data, `next/image` already allow-lists `*.supabase.co`, types/lint/build clean. **Announcements** keep the MadGigz logo (`AnnouncementCard`) by design. | Done. | S |
| 9 | 124 | **In-app poster creation when posting an event** | Today Add Show (`profile/add-show`, and the admin event form) takes an **uploaded** poster — so an artist without design tools is stuck. Give them a way to **generate a poster in-app** from the show details they're already typing: title, artist/line-up, venue, date/time, price, on **brand templates** (the maroon/orange/cream palette, Galdern display type — the same on-brand look `AnnouncementCard` already draws live for text announcements, and `scripts/make-posters.mjs` does offline). Likely shape: a few selectable templates, live preview, rendered client-side to an image (Canvas, or html-to-image on a styled node), then fed into the existing `uploadEventMedia` path as the event's poster — so it's just another image downstream, no schema change. Nice-to-haves: pick an accent/background, drop in the artist photo (#123) or a supplied image as the backdrop, auto-layout the text. **Adjacent to #99** (the in-app video editor) — both are "create the media in-app instead of leaving for another app"; this is the poster/image half and is far simpler (no ffmpeg/WebCodecs, just canvas). Keeps upload-your-own as the alternative. | Nothing technical — canvas/DOM-to-image render + the existing upload path. Needs a couple of template designs. | M |
| ♻️ | 125 | **Rotate the Apple Sign-in client secret (~every 6 months)** | **Recurring ops, not a feature.** The Apple provider's "Secret Key (for OAuth)" in Supabase (Auth → Providers → Apple) is a **JWT that Apple caps at 180 days** — when it lapses, **Sign in with Apple silently stops working** (no error until a user tries). To rotate: re-run Supabase's generator on their [Apple docs page](https://supabase.com/docs/guides/auth/social-login/auth-apple) with the **same inputs** — Team ID, Services ID (`es.aurasonic.madgigz.web`), Key ID, and the **`.p8`** file contents — copy the new JWT, paste into Supabase → Apple → Secret Key, Save. **Keep the `.p8` safe** (Apple only lets you download it once; it's the input every rotation needs — losing it means making a new key). First secret generated 12 Aug 2026, so **due ~Feb 2027**. Best made a real calendar reminder, not just a backlog line. | Nothing — a 5-minute dashboard task, on a clock. | XS |
| 5 | 126 | **App Store Connect: declare EU trader status (DSA)** | Surfaced as a banner in App Store Connect 12 Aug 2026. Under the EU **Digital Services Act**, developers must declare **trader status** (AuraSonic SL is a company → a *trader*) in App Store Connect → **Business** section, and provide a trader name, address and contact that **Apple displays publicly** on the store listing. **Required to distribute in the EU App Store** — and MadGigz is Madrid-first, so this gates the public EU launch. Does **not** block internal TestFlight testing, but must be done before the app is public in the EU. Apple's deadline (17 Feb 2025) is already past, so do it before submitting for public release. | You — App Store Connect → Business → enter AuraSonic SL trader details. | S |
| 5 | 127 | **App Store Connect: answer the new social-media age-rating questions** | Surfaced as a banner in App Store Connect 12 Aug 2026 ("Review New Social Media Questions on Age Ratings"). MadGigz has **user-generated content + social features** (the feed, artist posts, follows, profiles), so the new age-rating questionnaire about social-media capabilities **applies** and must be answered in **App Information → Age Rating**. Determines the app's age rating (likely 12+/17+ given UGC) and is **required before submitting for review / external TestFlight**. Answer honestly re: UGC, unmoderated vs moderated (we have #96 content moderation), and any social interaction. | You — App Store Connect → App Information → Age Rating questionnaire. | S |

## Why this order

**82a shipped on 10 Aug 2026**, and the split paid off exactly as intended:
the post-callback screen, the rewritten signup trigger and the
`complete_onboarding()` door are all provider-agnostic, so 82b really is a
provider toggle and a button whenever Apple gets round to Vir's verification.
It stays at the top because it is nearly free the moment it unblocks — not
because it is the most valuable thing here.

**#59 shipped (Aug 2026).** Every non-admin surface reads from a typed
en/es message catalog (`src/lib/i18n/`), locale is a cookie with
Accept-Language auto-detect and a manual switch in Settings, and the admin
panel stays English by design. Dates render `en-GB` and prices EUR
throughout — deliberately left, not forgotten.

One thing still needs a person, not code: the Spanish beyond the first
tranche is **my draft** and wants the same fluent-review pass the reviewer
gave the opening screens. The review sheet at
`docs/madgigz-translation-review.pdf` now covers all 487 strings (23 pages,
English | Español | correction), and it is generated from the live catalog
(`node scripts/export-i18n-json.mjs && python3
scripts/make-translation-review-pdf.py`), so it can't drift. Relay any
corrections and I'll apply them and regenerate.

**#95 is a subdomain, not a migration.** `madgigz.aurasonic.es` points at the
existing Vercel deployment: one DNS record at whoever hosts `aurasonic.es`, one
domain added in the Vercel project, and Vercel issues the certificate itself.
The apex is untouched, so the main AuraSonic site can live wherever it likes,
and Supabase does not move — it was always separate hosting.

The DNS part takes minutes. The part worth care is the settings that have to
move with it, because **each one fails silently rather than loudly**:

- `NEXT_PUBLIC_APP_URL` — every shared event link and link preview is built from
  it (`src/lib/site.ts`). Leave it and shares keep pointing at the old
  `.vercel.app` host, which still works, so nobody notices for weeks.
- **Supabase → URL Configuration** — the new origin needs adding to Redirect
  URLs and Site URL, or Google sign-in returns people to the site root with no
  session. Google Cloud itself needs no change: its redirect URI is Supabase's
  `/auth/v1/callback`, which doesn't move.
- **Stripe** — live keys, and a *separate* webhook endpoint registered against
  the new URL with its own signing secret. Test-mode webhooks do not carry over,
  and a missing endpoint means money is taken and no ticket is issued.
- Email needs nothing: Resend already sends as `@aurasonic.es`.
- **Unset `ALLOW_ADMIN_IMPERSONATION`** before launch — it's the admin "act as
  any user" testing tool (`docs/impersonation.md`). Off by default, but if it was
  turned on for testing, launch is when it must go back off.

Worth doing before this: the subdomain is also what a native shell would point
at, so picking it now means the URL doesn't change again when MadGigz becomes a
real app. Same reasoning as staying on web for launch — see the note on
Capacitor from 10 Aug 2026.

**#89 and #91 are one feature, and the risk is in the rules.** The form is an
afternoon; deciding what happens to the old handle is the part worth thinking
about. Releasing it immediately means someone can claim an artist's former
username the moment they change it, which is how impersonation starts.

**Vir decided this on 9 Aug 2026: a released username is held for 10 days
before anyone else can claim it.** Shorter than the 30 days most platforms use,
which is a deliberate trade — it frees good handles faster, and MadGigz is small
enough that a targeted impersonation attempt would be noticed. Implement it as a
`username_history` row (profile id, the old username, released_at) checked by
`username_available()`, rather than a flag on the profile: the profile can only
remember one previous name, and someone who changes twice in a fortnight would
otherwise release the first one instantly. Public
profiles are routed by id (`/profile/[artistId]`), not by username, so a rename
breaks no existing links — that part is already safe.

Doing #91 in the same pass matters because it changes what a username *is*: once
it's a login credential, a rename is a credential change, and the two features
have to agree about cooldowns and about what a freed username can be reused for.
Building them months apart means revisiting the same decision twice. The lookup
itself must live server-side and never return the email to the browser — it
signs the person in, it doesn't tell the caller what address it used.

**#88 turns on one decision: ownership.** `events.artist_id` assumes an artist
owns a show, and every RLS policy keyed on `events.artist_id = auth.uid()`
widens with it — events, event_artists, content_posts, and the whole checkout
path. Generalising it (an `owner_id` + `owner_type`, or a separate table) shapes
everything else, so settle it before any UI gets designed. The other two
questions are commercial rather than technical, and yours: who gets paid when a
promoter books an artist and whether the 5% splits three ways, and whether a
venue sees sales for shows at their venue they didn't book.

**#92's hard problem is payouts, not profiles.** Linking accounts together is
a `band_members` table and an afternoon. But a Stripe destination charge pays
exactly **one** connected account — so the moment a band sells a ticket, the
money has to land somewhere specific. That forces a product decision before any
code: either the band nominates one member's payout account and splits offline
(simple, and how most small acts already operate), or MadGigz splits at
checkout, which means Stripe Connect transfers per member, per sale, and a
share-percentage UI that every member has to agree to. The second is a
meaningfully bigger product with tax implications for each member — worth
choosing deliberately rather than discovering halfway in.

Two smaller questions ride along: whether a band show appears on each member's
own profile as well as the band's, and whether the artist verification flow runs
on the band or on each member (a band anyone can join is an impersonation route
into an established name). Neither is hard, but both shape the schema.

**#90 is the app's whole premise, so build the frame now even though Madrid is
the only city.** Explained by Vir on 11 Aug 2026: MadGigz is local — a fan opens
it and sees *their* city's shows, told plainly ("You're in Madrid"). Launch is
Madrid-only and new cities are turned on one at a time. The data is ready
(`events.city`, `venues.city`, both default `'Madrid'`), so this is three
decisions, not a schema problem:

1. **What "cities exist" means.** A small `cities` table (or an allow-list) with
   a launched flag, so switching on Barcelona later is a data change, not a
   deploy. Everything already says Madrid, so seeding it is trivial.
2. **How a fan's current city is chosen.** Options, cheapest first: a manual
   picker that defaults to Madrid and is remembered (a cookie, like locale);
   browser geolocation → nearest launched city as a *suggestion* only (needs a
   permission prompt and a reverse-geocode, and must fall back gracefully);
   or IP-based (rough, no prompt). MVP is the picker — with one city it's just a
   label, but it puts the plumbing in. Geolocation is a later nicety, and it's
   personal data, so it lives under the same GDPR rules as #58.
3. **Where the filter goes.** Feed, Explore and This-Week query by the current
   city instead of all events; the city is named in the header. One filter added
   in one place, because the column already exists.

**The two "later" halves the frame has to leave room for:** a fan *switching*
city while travelling (the picker becomes a real control, and "your city" vs
"the city you're browsing" become two different things — saved/tickets stay
yours, the feed follows the browsed city), and a touring artist *posting into
another city* (the Add-Show venue picker can't stay locked to one city, and a
venue may need creating in a city the artist doesn't live in). Neither is MVP,
but choosing the "current city" representation now (a value the whole app reads,
not a hardcoded `'Madrid'`) is what keeps both from being a rewrite. Size is L
because of these, not the launch cut, which is closer to M.

**#58 collects personal data.** Geolocation and login history are personal data
under GDPR, so they fall under the retention and erasure rules `addendum_019`
set up — the purge in `src/lib/account-deletion.ts` would have to scrub whatever
this adds. Decide what it's *for* before building it: "useful someday" is a poor
reason to start retaining people's locations.

**#97 and #98 are both "when there is money to justify it".**

Tax (#97) is the one that arrives on its own schedule: the moment real euros
move, somebody has to account for IVA on the MadGigz fee and artists start
needing invoices for their accountant. Stage 6 explicitly parked VAT as "an
accountant's question, not a guess in code" and that is still the right call.

**Design worked out with Vir on 11 Aug 2026 (planning ahead, gestor pending).**
The frame: **Odoo is the invoice engine, MadGigz/website is the data-capture
layer, the gestor signs off the tax.** MadGigz never generates a legal factura —
it feeds Odoo accurate counterparties, and Odoo issues the documents. This is
the only way to build any of it without guessing Spanish tax rules in code.

_Two distinct invoice flows, and they are not the same job:_

- **A — Artist-owned shows sold through MadGigz.** Money already flows
  fan→artist via the Stripe destination charge, minus MadGigz's 5% + 21% IVA.
  What's owed is a **service-fee factura, MadGigz → the artist** (or the org that
  represents them). Needs the artist's fiscal identity, or an organisation to
  bill instead.
- **B — House shows (MadGigz owns the event).** MadGigz is the seller, so it must
  **issue sales invoices for the tickets** (B2C — likely _factura simplificada_
  per ticket, full factura on request; IVA rate on live-music tickets is a
  gestor question). _Then_ MadGigz **pays the performing artist**, and this is
  where "payouts get more complicated": the artist may not be autónomo and gets
  paid via a **cooperativa de facturación** (ARTiCAT, Xº Décimo Arte, SMart,
  etc.) that employs them for the event days and **invoices MadGigz under its own
  CIF**. So the payee is often the cooperativa, not the artist — and Stripe
  Connect doesn't apply here because MadGigz collected the ticket money itself.

_The entity model MadGigz needs (the part that's ours to build, no tax guesses):_
a private **fiscal identity** per artist (entity type individual/company/coop,
legal name, NIF/NIE/CIF, fiscal address, IVA regime) — stored owner-only +
service-role, **never on the public `profiles` table** (it's exactly the
personal-data class CLAUDE.md warns about); an **organisations** store (promoters,
agencies, cooperativas — same fiscal fields, admin-managed); and a link from
artist → the entity to bill/pay (possibly per-event, since a touring artist may
use different orgs show to show). Each maps to an Odoo `res.partner`.

_The open architecture fork (Vir, 11 Aug):_ **where does fiscal capture live?**
(1) In the MadGigz app, then sync Supabase→Odoo via the RPC tool; or (2) **on the
Odoo-hosted website directly** (`aurasonic.es` is already Odoo-linked), so the
data lands natively as `res.partner` with no sync bridge and Odoo stays the
single source of truth. Option 2 is cleaner if the artist tolerates leaving the
app for a form — the app then only needs a "fiscal registration complete" flag
read back from Odoo to gate house-selling/invoicing. Leaning (2); decide when
building.

_Questions the gestor has to answer before any of this is built (these gate the
schema and the flows, and are genuinely not a coding call):_
1. Flow A: is a "service fee" factura MadGigz→artist for the 5% + 21% IVA the
   correct instrument? Reverse-charge if the org is in another EU state?
2. Flow B tickets: _factura simplificada_ per ticket vs a periodic summary; which
   **IVA rate** applies to live-music tickets (21% / reduced 10% / cultural
   treatment); and AuraSonic SL as fiscal seller of record.
3. Flow B payout: accepting a supplier invoice from the artist/cooperativa, and
   what **IRPF retención** applies when MadGigz pays a Spanish artist directly.
4. **Verifactu / SII** e-invoicing obligations — these decide whether Odoo must
   be the legal system of record and constrain how invoices may be issued.
5. Exactly which **fields a valid Spanish invoice requires** for each flow, so
   MadGigz captures precisely those and no more.

In-house payments (#98) is the furthest thing on this list and should probably
stay there. Taking payments directly means becoming a payment facilitator:
PSD2/SCA compliance, PCI scope, holding other people's money, and in Spain a
licence to do it. Stripe's cut buys all of that plus the fraud handling and the
Connect payouts. It only becomes arguable at volumes where a percentage point
is real money, and MadGigz is a long way from there.

**#103 shipped (10 Aug 2026): `docs/key-rotation.md`.** Every secret the app
holds, its blast radius if leaked, and a five-step per-secret runbook, all
grounded in the actual env the code reads. The non-obvious part is *order*:
create at the provider → update Vercel env → redeploy → verify `/api/health` →
only then revoke the old value (the reverse takes the app down between steps —
the same two-phase discipline the migrations use). It flags the two traps: the
Supabase JWT-secret rotation is the one heavy case that signs everyone out, and
the Google OAuth client secret lives in the Supabase dashboard, not Vercel env.
Going live (#95) already forces the Stripe half, so the doc's Stripe rows and the
go-live checklist are the same work — do them together.

**#104 pays for itself the moment a convention is applied wrong once.** The rules
that already bit us live in CLAUDE.md prose — column GRANTs, the two-phase
revoke, "read the stored value back" — and a skill turns each into an invokable
checklist instead of something to remember. The i18n add-a-string flow is the
clearest candidate: it's now four coordinated steps (en.ts, es.ts, the JSON
export, the PDF) and easy to half-do.

_First skill shipped 10 Aug 2026: `.claude/skills/simulate-users/` — a
self-contained load / end-to-end harness (`scripts/simulate-users.mjs`) that
onboards N synthetic users and drives real fan sessions under concurrency, then
tears the cohort down. Sends no email, touches no money, and is dry-run by
default. The convention-checklist skills (migration two-phase, i18n add-a-string,
adversarial-probe, "read the Next docs first") are still to come._

**#105 ("web version") needs one sentence from Vir before it's scoped.** The app
is *already* web — so this means one of two different jobs: a wide-screen/desktop
layout for the existing app (multi-column, not a phone in the middle of a
monitor), or a separate marketing site on the apex. They share almost no work.
Parked like #90 until clarified.

## Load & servers — the short version

Assessed 10 Aug 2026 (`docs/load-and-capacity.md`, `scripts/load-probe.mjs`):
**100 people browsing at once is comfortable** — a live read probe held to 60
concurrent page-loads (240 parallel queries) at p95 ~0.7s with zero errors on the
free tier, and Vercel's burst ceiling is 1,000 concurrent, so 100 is ~10%. **100
people onboarding at once is gated by email, not servers**: Supabase's custom-SMTP
signup limit defaults to 30/hour and Resend's free tier is 100 emails/day — both
config/plan settings to raise before any launch push, not code to change.

## To test when you're back

- **Smoke-test fan → artist upgrade** (shipped 10 Aug 2026). As a fan (impersonate
  one via /admin/users), Profile → Settings → "Switch to artist account" → confirm
  → should land on the claim form; submit → appears in the admin artist queue as
  pending → approve it. Built and build-verified, not yet clicked through on a
  live login.

## Nothing else is currently waiting on you

`CRON_SECRET` set, every migration through `addendum_027` run, Stripe keys
rotated, every active venue has an address, both email templates updated in the
dashboard. The house-show path — list, buy, refund, tag, post content, edit —
has been exercised end to end; notifications fire on ticket purchases and
follows; Google sign-up and sign-in both work; and the feedback path has been
walked from the Settings sheet through to resolving it in the admin panel.

Three adversarial probes live in `scripts/` and are worth re-running after any
migration that touches policies or grants — `security-probe.mjs` (what a fan
can do), `probe-artist-side.mjs` (what an artist can do), `probe-feedback.mjs`.
They create and delete their own throwaway accounts. Everything currently
passes; the pattern to keep is that each check reads the stored value back,
because an UPDATE matching zero rows returns no error and "did it error?"
reports a locked door as a hole.
