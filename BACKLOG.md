# MadGigz backlog

Open items only. Anything not listed here has shipped — see `git log`.

Numbering is historical and deliberately not re-packed, so a number always means
the same thing across old conversations. Gaps are shipped items.

## Open

| # | Item | Why it's waiting |
|---|---|---|
| 79 | Make clear that the email verification link is decorative | Mail scanners open the link within ~15s of sending, so effectively nobody completes verification by tapping it — the sign-in notice *is* the verification experience. Needs deciding whether to say so in the email, drop the button entirely, or leave it. |
| 66 | Share button with link/message integration | Blocked on a public event page: nothing is viewable logged-out today, so a shared link would dead-end at the landing page. |
| 70 | Account deletion (fan + artist self-serve, plus admin delete user) | Needs a retention decision first — tickets and payment records can't simply vanish, so "delete" has to mean anonymise-and-keep for some tables. GDPR-shaped, worth getting right once. |
| 62 | Admin/house-created shows | Part 1: shows with an external ticket link (no Stripe, no fee). Part 2: MadGigz-hosted shows. Blocker: `event_artists` policies check `events.artist_id = auth.uid()`, so admin tagging needs its own server action. |
| 59 | Spanish/English localization | Sequenced late on purpose — i18n means pulling every UI string into translation files, so it wants the fan-facing UI settled first, or new strings need a second pass. |
| 58 | Admin: user activity tracking | Login frequency, geolocation, attendance history. Needs new tracking infrastructure, not just a query. Heaviest lift here, least urgent. |
| 63 | Past-events storage/function | Unscoped — you flagged it needs fleshing out before it can be planned. |
| 60 | Fan-follows-artist infrastructure | Your own post-MVP call. Follower counts are hidden on artist profiles today rather than faked as a permanent 0. |

## Loose ends (not backlog items, but outstanding)

- **`addendum_016` not yet run** — drops the now-empty `profiles.evidence_url`. Self-guards, so it's safe whenever.
- **Near-duplicate venues** need your call: `El Sol` vs `Sala El Sol` (2 shows attached), `Sala Apolo` vs `Teatro Apolo`. Not auto-merged because merging repoints real shows.
- **12 venues without addresses** in `/admin/venues`, including test junk (`sala`, `Test venue`, `Vir House`, `Bookshop`).
- **Stripe test keys** were printed in a chat transcript — worth rolling.
