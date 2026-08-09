# MadGigz backlog

Open items only. Anything not listed here has shipped — see `git log`.

Numbering is historical and deliberately not re-packed, so a number always means
the same thing across old conversations. Gaps are shipped items.

## Open

| # | Item | Why it's waiting |
|---|---|---|
| 82 | Sign up / sign in with Google and Apple | Supabase supports both providers, but an OAuth callback carries no username, role or date of birth — and the profile trigger and the 16+ age gate both need all three — so it needs a post-callback step to collect them. Also needs a decision on what happens when an OAuth email matches an existing password account. Apple requires a paid Apple Developer account; Google is free. |
| 79 | Make clear that the email verification link is decorative | Mail scanners open the link within ~15s of sending, so effectively nobody completes verification by tapping it — the sign-in notice *is* the verification experience. Parked pending tester feedback: say so in the email, drop the button, or leave it. |
| 62 | Admin/house-created shows | Part 1: shows with an external ticket link (no Stripe, no fee). Part 2: MadGigz-hosted shows. Blocker: `event_artists` policies check `events.artist_id = auth.uid()`, so admin tagging needs its own server action. |
| 59 | Spanish/English localization | Sequenced late on purpose — i18n means pulling every UI string into translation files, so it wants the fan-facing UI settled first, or new strings need a second pass. |
| 58 | Admin: user activity tracking | Login frequency, geolocation, attendance history. Needs new tracking infrastructure, not just a query. Heaviest lift here, least urgent. |
| 63 | Past-events storage/function | Unscoped — what should happen to a show once its date passes? Needs deciding before it can be planned. |
| 60 | Fan-follows-artist infrastructure | Post-MVP call. Follower counts are hidden on artist profiles today rather than faked as a permanent 0. |

## Waiting on Vir

- **`CRON_SECRET` is not set in Vercel.** The nightly account purge returns 503
  and refuses to run, so deletion requests are accepted but never complete.
  This is the one genuinely blocking item.
- **`El Sol` has no address** in `/admin/venues` — the last one. Its old value
  was wrong (it carried Café Berlín's address), so it was nulled rather than
  left to sit there looking correct.
- **Stripe test keys** were printed in a chat transcript — worth rolling.
- **Remove the `deleted-da7ab6e6` tombstone?** Left in `/admin/users` so a real
  purged row is visible. Nothing depends on it.
- **Payouts for Losing The Count and Hard Fuse.** Neither has Stripe connected,
  so their shows can only be free or externally ticketed until they onboard.

## Verified-by-hand gaps

Things built and shipped but never exercised through the UI, so worth a click
before trusting them:

- The account-deletion dialog, the sign-in cancellation, and the "your account
  is safe" notice. The purge itself *has* been run end to end and verified
  (personal fields scrubbed, sign-in blocked, ticket rows survived).
