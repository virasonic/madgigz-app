# MadGigz backlog

Open items only. Anything not listed here has shipped — see `git log`.

Numbering is historical and deliberately not re-packed, so a number always means
the same thing across old conversations. Gaps are shipped items.

## In suggested order

| Order | # | Item | What the work actually is | Blocked on | Size |
|---|---|---|---|---|---|
| 1 | 82b | **Apple sign-in** | Enable the provider, add the button next to Google's. Small, because 82a already built the post-callback screen and it is provider-agnostic. | **Apple**, approving your developer verification. | S |
| 6 | 104 | **Claude skills for code organisation** | Package the repo's own conventions as `.claude/skills/` so they're applied the same way every time instead of living in CLAUDE.md prose and my head: the migration two-phase + column-GRANT rules, the i18n "add a string" workflow (en.ts → es.ts → `export-i18n-json.mjs` → regenerate the review PDF), the adversarial-probe pattern (read the stored value back), and the "read `node_modules/next/dist/docs` before writing Next code" rule. Turns tribal knowledge into invokable checklists. | Nothing. | S |
| 7 | 105 | **Full web / desktop version** | The app is mobile-first — built and tested at 375px, every screen a single phone-width column. A proper wide-screen experience (multi-column feed/explore, a desktop layout rather than a centred phone) suits fans browsing on a laptop, and is likely what a promoter/venue back-office (#88) wants anyway. **Vir to confirm the intent** — this could instead mean a marketing site on the apex `aurasonic.es`, which is a separate job from restyling the app for wide screens. | Vir to clarify scope. | M–L |
| 3 | 95 | **Go live on `madgigz.aurasonic.es`** | Decided 10 Aug 2026: the webapp gets a subdomain of the domain Vir already owns, with `aurasonic.es` itself left for the main AuraSonic site. Vercel stays the host. A DNS record and a Vercel domain, then the settings that must move with it — Stripe live keys, a new webhook endpoint, `NEXT_PUBLIC_APP_URL`, and Supabase's redirect allow-list. See below for what breaks quietly if one is missed. | Nothing. Vir's call on when. | M |
| 4 | 108 | **Pre-production / staging environment** | A second, hosted copy of the app to test big changes against a realistic stack *before* they touch live — because once #95 ships, "test it locally" stops being safe enough. A `staging` (or `preview`) Vercel deployment on its own subdomain, pointed at a **separate Supabase project** (its own DB, its own migrations run first) and **Stripe test mode**, driven by a `.env.staging`. Then the flow becomes: change → deploy to staging → exercise it (the `simulate-users` skill and the probes already take `--env=.env.staging`) → promote to prod. Ties into #103 (staging holds its own set of the same secrets) and gives the user-simulation harness the throwaway project it always wanted. | Nothing. Some one-time setup. | M |
| 4 | 90 | **City-centric — the app's core identity** | MadGigz is *local*: a fan sees shows in **their city only**, framed as "You're in Madrid — here's what's on". Launch is **Madrid only**, then cities are switched on **one at a time**. Groundwork is already there — `events.city` and `venues.city` both exist (default `'Madrid'`). The work: a "current city" the app knows (a launched-cities list + how the user's city is set — see note), feed/Explore/This-Week filtered to it, and the city named in the UI. **Later:** a fan can switch cities (travelling), and a touring artist can post shows in another city (venue picker not locked to one city). | Vir has explained it (11 Aug 2026); ready to scope. | L |
| 5 | 101 | **Live updates (Supabase realtime)** | Nothing on the app is live — the notifications bell, the sold count, and new announcements only change on reload. Principle 3 of the Rauch "rich web apps" piece: push data changes to clients rather than making them ask. Supabase ships realtime subscriptions and we use none. Scope it to the two places a stale number actually *misleads* someone: the unread bell and a show's sold/sold-out state. | Nothing. | M |
| 7 | 88 | **Promoter & venue flows** | Account types alongside fan/artist, probably web rather than the app. Groundwork exists: admin-created shows already model a show with no `artist_id` managed by its creator, `venues` rows carry a `verified` flag an account could claim, and the artist claim-and-evidence flow is the precedent for verifying someone represents a venue. | Later, your call. Decide ownership first. | L |
| 8 | 92 | **Band infrastructure (artists ⇄ bands)** | **Artists are people, bands are groups**, and the link is **many-to-many**: an artist plays in several bands, a band has several artist members. So a band is its own profile-like entity (name, photo, socials, its own shows), joined to artist profiles through a `band_members` table (band_id, profile_id, role, share) — not a flag on a profile. Members keep their own artist accounts and appear under each band they're in; a band's shows can also surface on each member's profile. `event_artists` (`addendum_012`) is the precedent for profile↔event tagging, but this is profile↔band↔profile, a new entity and a new answer to "who owns this". Big feature, genuinely useful. The sharp edge is money, not the graph — see below. | Not now, by Vir's call. Design the payout model first. | XL |
| 9 | 58 | **Admin activity tracking** | Login frequency, geolocation, attendance history. A new events table and a write path, not just a query. | Nothing technical. Needs a purpose first. | L |
| 10 | 99 | **In-app video editor** | Trim, crop to vertical, add a music bed, maybe captions — so an artist can post from their phone without leaving for CapCut and coming back. Real scope: it is a media pipeline, not a screen. Browser-side trimming is doable with the WebCodecs API; anything more (music beds, transcode-on-upload) wants server-side ffmpeg, which Vercel's function limits make awkward. Music also needs a licensed library, which is a commercial deal, not code. | Nothing technical. Worth doing once artists are actually posting. | XL |
| 11 | 100 | **Supabase storage and bandwidth headroom** | Vir is happy to pay — this is about noticing *before* uploads start failing, not about avoiding the bill. Free tier is 1GB storage / 5GB egress; Pro is $25/mo for 100GB. The real lever is #96 (nothing is resized on upload — one avatar is a 4MB phone screenshot), which cuts both storage and egress without spending anything. Wants a size figure in the admin dashboard so the trend is visible. | Nothing. Watch it. | S |
| 12 | 97 | **Tax & invoicing compliance** | Spanish IVA on the MadGigz fee, invoices artists can give their accountant, and whatever an artist selling tickets needs to declare. Stage 6 deliberately left VAT out of scope as "an accountant's question, not a guess in code" — this is that question coming back. | An accountant. Genuinely not a coding decision. | L |
| 13 | 98 | **In-house payments** | Replacing Stripe Connect with direct payment handling. **Much later, by Vir's note.** Would mean becoming a payment facilitator: PSD2/SCA, PCI scope, holding other people's money, and a licence. Stripe's 1.5% + €0.25 buys all of that. | Far future. Only worth it at real volume. | XL |

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
accountant's question, not a guess in code" and that is still the right call -
this item is a reminder that the question is waiting, not an invitation to
guess at it.

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
