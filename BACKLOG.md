# MadGigz backlog

Open items only. Anything not listed here has shipped — see `git log`.

Numbering is historical and deliberately not re-packed, so a number always means
the same thing across old conversations. Gaps are shipped items.

## Open

| # | Item | Why it's waiting |
|---|---|---|
| 83 | Hide the Google and Apple buttons until they work | They render disabled on sign-in and sign-up, which reads as broken rather than unbuilt. Remove them and the "or" divider; bring them back with #82. Small — a few lines. |
| 82 | Sign up / sign in with Google and Apple | The buttons already exist on both screens, rendered disabled. Supabase supports both providers, but OAuth callbacks carry no username, role or date of birth — and the profile trigger and the 16+ age gate both need those — so it needs a post-callback step to collect them. Apple also needs a paid Apple Developer account. |
| 79 | Make clear that the email verification link is decorative | Mail scanners open the link within ~15s of sending, so effectively nobody completes verification by tapping it — the sign-in notice *is* the verification experience. Needs deciding whether to say so in the email, drop the button entirely, or leave it. |
| 70 | Account deletion (fan + artist self-serve, plus admin delete user) | Needs a retention decision first — tickets and payment records can't simply vanish, so "delete" has to mean anonymise-and-keep for some tables. GDPR-shaped, worth getting right once. |
| 62 | Admin/house-created shows | Part 1: shows with an external ticket link (no Stripe, no fee). Part 2: MadGigz-hosted shows. Blocker: `event_artists` policies check `events.artist_id = auth.uid()`, so admin tagging needs its own server action. |
| 59 | Spanish/English localization | Sequenced late on purpose — i18n means pulling every UI string into translation files, so it wants the fan-facing UI settled first, or new strings need a second pass. |
| 58 | Admin: user activity tracking | Login frequency, geolocation, attendance history. Needs new tracking infrastructure, not just a query. Heaviest lift here, least urgent. |
| 63 | Past-events storage/function | Unscoped — you flagged it needs fleshing out before it can be planned. |
| 60 | Fan-follows-artist infrastructure | Your own post-MVP call. Follower counts are hidden on artist profiles today rather than faked as a permanent 0. |

Shipped since this file was written: **#66** (public `/e/[id]` event page, link previews,
share on every surface) and the `profiles` column-grant lockdown.

## Loose ends (not backlog items, but outstanding)

- **Near-duplicate venues** need your call: `El Sol` vs `Sala El Sol` (2 shows attached), `Sala Apolo` vs `Teatro Apolo`. Not auto-merged because merging repoints real shows.
- **12 venues without addresses** in `/admin/venues`, including test junk (`sala`, `Test venue`, `Vir House`, `Bookshop`).
- **Stripe test keys** were printed in a chat transcript — worth rolling.
