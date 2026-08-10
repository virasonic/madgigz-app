# MadGigz backlog

Open items only. Anything not listed here has shipped — see `git log`.

Numbering is historical and deliberately not re-packed, so a number always means
the same thing across old conversations. Gaps are shipped items.

## In suggested order

| Order | # | Item | What the work actually is | Blocked on | Size |
|---|---|---|---|---|---|
| 1 | 82b | **Apple sign-in** | Enable the provider, add the button next to Google's. Small, because 82a already built the post-callback screen and it is provider-agnostic. | **Apple**, approving your developer verification. | S |
| 2 | 59 | **Spanish/English localization** | Every UI string into translation files, a language switch, and the Spanish itself. Dates and currency are already `en-GB`/EUR. | A fluent Spanish pass on the copy — yours or a translator's. | L |
| 3 | 95 | **Go live on `madgigz.aurasonic.es`** | Decided 10 Aug 2026: the webapp gets a subdomain of the domain Vir already owns, with `aurasonic.es` itself left for the main AuraSonic site. Vercel stays the host. A DNS record and a Vercel domain, then the settings that must move with it — Stripe live keys, a new webhook endpoint, `NEXT_PUBLIC_APP_URL`, and Supabase's redirect allow-list. See below for what breaks quietly if one is missed. | Nothing. Vir's call on when. | M |
| 4 | 89 | **Let people change their username** | A field on Edit Profile. The database side is already built — `addendum_010`'s format check, `addendum_011`'s case-insensitive unique index and `username_available()` RPC — so this is the signup form's availability check, reused. The real work is the rules around it (see below), not the form. Cooldown decided: **10 days**. | Nothing. | S |
| 5 | 91 | **Sign in with a username** | Supabase Auth only authenticates on email, so this needs a server-side username→email lookup that signs the person in without ever returning the email to the browser. Build it with #89, not apart from it — a changeable username that is also a login credential is one feature, not two. | Nothing. | M |
| 6 | 90 | **"City centric"** | Vir to explain — noted 9 Aug 2026 so it isn't lost. | Vir. | ? |
| 7 | 88 | **Promoter & venue flows** | Account types alongside fan/artist, probably web rather than the app. Groundwork exists: admin-created shows already model a show with no `artist_id` managed by its creator, `venues` rows carry a `verified` flag an account could claim, and the artist claim-and-evidence flow is the precedent for verifying someone represents a venue. | Later, your call. Decide ownership first. | L |
| 8 | 92 | **Band profiles made of member accounts** | Members keep their own artist accounts but appear under one band profile. Explicitly **not MVP** — parked. `event_artists` (`addendum_012`) is the precedent for profile↔event tagging, but a band is profile↔profile, which is a new table and a new answer to "who owns this". The sharp edge is money, not tagging — see below. | Not now, by Vir's call. | L |
| 9 | 58 | **Admin activity tracking** | Login frequency, geolocation, attendance history. A new events table and a write path, not just a query. | Nothing technical. Needs a purpose first. | L |

## Why this order

**82a shipped on 10 Aug 2026**, and the split paid off exactly as intended:
the post-callback screen, the rewritten signup trigger and the
`complete_onboarding()` door are all provider-agnostic, so 82b really is a
provider toggle and a button whenever Apple gets round to Vir's verification.
It stays at the top because it is nearly free the moment it unblocks — not
because it is the most valuable thing here.

**#59 before #95, not after.** MadGigz launches in Madrid. Putting an
English-only app in front of a Spanish audience is a handicap you'd then be
fixing in public, so the translation belongs on the near side of going live.
The sequencing constraint that used to hold it back is now satisfied: i18n
touches every string, and the auth screens it was waiting on are finished, so
they get translated once instead of twice.

The blocker on it is judgement, not code — machine-translated copy in a
scene-facing app reads as an outsider immediately, and MadGigz's whole pitch is
being local. Budget for a fluent pass over the strings.

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

**#58 collects personal data.** Geolocation and login history are personal data
under GDPR, so they fall under the retention and erasure rules `addendum_019`
set up — the purge in `src/lib/account-deletion.ts` would have to scrub whatever
this adds. Decide what it's *for* before building it: "useful someday" is a poor
reason to start retaining people's locations.

## Nothing is currently waiting on you

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
