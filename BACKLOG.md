# MadGigz backlog

Open items only. Anything not listed here has shipped — see `git log`.

Numbering is historical and deliberately not re-packed, so a number always means
the same thing across old conversations. Gaps are shipped items.

## In suggested order

| Order | # | Item | What the work actually is | Blocked on | Size |
|---|---|---|---|---|---|
| 1 | 82a | **Google sign-in** | The hard part of #82, and it isn't the provider: an OAuth callback carries no username, role or date of birth, and the profile trigger and 16+ age gate need all three — so it needs a post-callback screen to collect them. Also a decision on what happens when a Google email matches an existing password account. | **You** — a Google Cloud OAuth client. Free, about ten minutes. | M |
| 2 | 82b | **Apple sign-in** | Enable the provider, add the button. Small, because 82a already built the callback screen — it's provider-agnostic. | **Apple**, approving your developer verification. | S |
| 3 | 59 | **Spanish/English localization** | Every UI string into translation files, a language switch, and the Spanish itself. Dates and currency are already `en-GB`/EUR. | Sequencing (see below), plus a fluent Spanish pass on the copy. | L |
| 4 | 79 | **Verification link is decorative** | Say so in the email, drop the button, or leave it. Scanners open the link within ~15s of sending, so nobody completes verification by tapping it — the sign-in notice *is* the verification step. | Your decision. Can jump the queue any time — it's five minutes. | S |
| 5 | 89 | **Let people change their username** | A field on Edit Profile. The database side is already built — `addendum_010`'s format check, `addendum_011`'s case-insensitive unique index and `username_available()` RPC — so this is the signup form's availability check, reused. The real work is the rules around it (see below), not the form. | Nothing. Decide the cooldown. | S |
| 6 | 91 | **Sign in with a username** | Supabase Auth only authenticates on email, so this needs a server-side username→email lookup that signs the person in without ever returning the email to the browser. Build it with #89, not apart from it — a changeable username that is also a login credential is one feature, not two. | Nothing. | M |
| 7 | 90 | **"City centric"** | Vir to explain — noted 9 Aug 2026 so it isn't lost. | Vir. | ? |
| 8 | 88 | **Promoter & venue flows** | Account types alongside fan/artist, probably web rather than the app. Groundwork exists: admin-created shows already model a show with no `artist_id` managed by its creator, `venues` rows carry a `verified` flag an account could claim, and the artist claim-and-evidence flow is the precedent for verifying someone represents a venue. | Later, your call. Decide ownership first. | L |
| 8 | 58 | **Admin activity tracking** | Login frequency, geolocation, attendance history. A new events table and a write path, not just a query. | Nothing technical. Needs a purpose first. | L |

## Why this order

**Google before Apple, not both together.** Apple needs verification you're
waiting on; Google needs a free OAuth client you can create today. The
post-callback screen — the actual work — is shared, so building it against
Google means Apple later is a provider toggle and a button rather than a
rebuild. Waiting for Apple would block the whole of #82 on something outside
your control.

**Localization after the auth screens exist.** i18n means touching every string
in the app, so anything built afterwards needs its own translation pass. Doing
#82 first means those screens get translated once instead of twice. This is the
only ordering constraint that actually costs money to get wrong.

**#89 and #91 are one feature, and the risk is in the rules.** The form is an
afternoon; deciding what happens to the old handle is the part worth thinking
about. Releasing it immediately means someone can claim an artist's former
username the moment they change it, which is how impersonation starts — so the
default should be a cooldown (30 days is the usual) before a released name is
claimable again, plus a limit on how often one account can change. Public
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

**#58 collects personal data.** Geolocation and login history are personal data
under GDPR, so they fall under the retention and erasure rules `addendum_019`
set up — the purge in `src/lib/account-deletion.ts` would have to scrub whatever
this adds. Decide what it's *for* before building it: "useful someday" is a poor
reason to start retaining people's locations.

## Nothing is currently waiting on you

`CRON_SECRET` set, every migration through `addendum_023` run, Stripe keys
rotated, every active venue has an address. The house-show path — list, buy,
refund, tag, post content, edit — has been exercised end to end, and
notifications are confirmed firing on ticket purchases and follows.
