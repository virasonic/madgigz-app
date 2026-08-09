# MadGigz backlog

Open items only. Anything not listed here has shipped — see `git log`.

Numbering is historical and deliberately not re-packed, so a number always means
the same thing across old conversations. Gaps are shipped items.

## Open

| # | Item | What the work actually is | Blocked on | Size |
|---|---|---|---|---|
| 82 | Google & Apple sign-in | Enable both providers in Supabase; add a post-callback screen to collect username, role and date of birth (an OAuth callback carries none of them, and the profile trigger and 16+ gate need all three); decide what happens when an OAuth email matches an existing password account. | **You.** A Google Cloud OAuth client (free) and an Apple Developer account (~€99/yr) for the Services ID and signing key. | M–L |
| 60 | Fan follows artist | New `follows` table + RLS, follow/unfollow on artist profiles, real counts (hidden today rather than faked as a permanent 0), and deciding whether the feed weights followed artists. | Your post-MVP call. | M |
| 63 | Past events | What happens to a show once its date passes — drop out of Explore, move to an archive, stay on the artist's profile as history? Tickets must keep working for check-in either way. | **You**, to scope. | S–M once scoped |
| 79 | Email verification link is decorative | Decide: say so in the email, drop the button, or leave it. Scanners open the link within ~15s of sending, so nobody completes verification by tapping it — the sign-in notice *is* the verification step. | Your decision. Deprioritised. | S |
| 59 | Spanish/English localization | Pull every UI string into translation files, add a language switch, write the Spanish. Dates and currency are already `en-GB`/EUR, so those are fine. | Sequencing, plus a fluent Spanish pass on the copy. Best done **after** #82, or its new auth screens get translated twice. | L |
| 58 | Admin user activity tracking | Login frequency, geolocation, attendance history. Needs a new events table and a write path, not just a query. | Nothing technical. Least urgent. | L |

### Two worth reading before starting

**#58 collects personal data.** Geolocation and login history are personal data
under GDPR, so they fall under the same retention and erasure rules the account
deletion work set up in `addendum_019` — the purge in
`src/lib/account-deletion.ts` would have to scrub or anonymise whatever this
adds. Decide what it is *for* before building it: "useful someday" is a poor
reason to start retaining people's locations.

**#59 wants to go last.** i18n means touching every string in the app. Anything
built afterwards needs its own translation pass, so each feature shipped before
it is one that gets translated once instead of twice.

## Suggested order

1. **#63** — cheapest, and the one where shows quietly pile up as the calendar
   moves. Needs ten minutes of your thinking more than mine.
2. **#82** — the biggest fan-facing win; sign-up friction is what costs users.
3. **#60** — makes artist profiles worth following, and gives the feed something
   to personalise on.
4. **#59** — after the above, so the strings are translated once.
5. **#58** — whenever, and only once it has a purpose.

**#79** is a five-minute change whenever you decide the answer.

## Nothing is currently waiting on you

`CRON_SECRET` set, `addendum_020` run, Stripe keys rotated, every active venue
has an address, tombstone removed. The house-show path — list, buy, refund, tag,
post content, edit — has been exercised end to end.
