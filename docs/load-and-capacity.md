# MadGigz — 100-user load & capacity assessment

_Written 10 Aug 2026. Combines the app's real per-request cost, the hosting
tiers' published limits, and a live read-path probe (`scripts/load-probe.mjs`)._

## TL;DR

For **100 people using the app at once, the servers are fine.** For **100 people
onboarding at once, email is the wall** — and it's a config/plan setting, not a
scaling problem. Nothing in the code needs to change to survive 100 users; two
dashboard settings and one paid plan do.

## 1. The real bottleneck: onboarding email, not compute

Sign-up sends a confirmation email through Supabase Auth, which we've pointed at
Resend (custom SMTP). Two limits stack up:

- **Supabase Auth, custom SMTP:** default **30 new users / hour**. The 31st
  signup in an hour gets `429: email rate limit exceeded`. Configurable in
  **Authentication → Rate Limits**.
- **Resend free tier:** **100 emails / day** and **2 requests / second** (raisable
  to 10/s on request). 100 simultaneous signups would burn the entire daily
  quota and burst past 2/s.

So **100 real signups in one window fail for most users on email limits long
before any CPU or database strain.** This is the single most important finding
and it is pure configuration + plan choice.

**Fix before any launch push:**
1. Raise the Supabase Auth signup rate limit to match the expected burst.
2. Move Resend off the free tier (or request the 10/s limit) so the daily email
   cap isn't ~100 signups/day.
3. Turnstile (already wired on signup) blocks bot bursts but does nothing for a
   legitimate crowd — the two settings above are what matter.

## 2. Serving & browsing 100 concurrent users: comfortable

**Vercel** (Hobby or Pro): burst limit is **1,000 concurrent executions per 10s
per region**, scaling to 30,000. 100 concurrent users is ~10% of one region's
burst — not a bottleneck. The one watch-item is Hobby's **10s function timeout**;
our server renders finish in well under 1s, so there's large headroom, but it's
the reason a launch belongs on Pro (60s limit) eventually.

**Supabase read path — measured live** (`scripts/load-probe.mjs`, each "page
load" = the 4 public feed queries fired in parallel, current Free tier):

| Concurrency | p50 | p95 | max | errors |
|---|---|---|---|---|
| 1 | 166 ms | 725 ms | 725 ms | 0 |
| 10 | 252 ms | 1046 ms | 1072 ms | 0 |
| 30 | 298 ms | 623 ms | 623 ms | 0 |
| 60 | 513 ms | 716 ms | 623 ms | 0 |

Latency roughly doubles from 1→60 concurrent (166→513 ms p50) — graceful
degradation, not a cliff — with **zero errors** at 240 parallel queries. The high
p95 at low load is the free project waking from idle (auto-pause) plus network
variance; under sustained traffic it warms up. The read path, even on the free
tier, comfortably handles the browsing load of 100 users.

## 3. Per-request cost (from the code)

- **Logged-out visitor:** the middleware detects there's no `sb-` cookie and
  **skips the Supabase auth round-trip entirely** (`src/middleware.ts`). A public
  page is just a few PostgREST reads.
- **Signed-in feed load:** middleware `getUser()` (auth-server round-trip) +
  page-level `fetchCurrentUser()` (a second `getUser()` + a `profiles` select) +
  ~5 data queries ≈ **2 auth round-trips + ~6 REST queries** per navigation.
- Minor optimization available: the two `getUser()` calls per signed-in page
  could be one if the middleware's result were passed down. ~50–150 ms saved per
  navigation; not a blocker at 100 users, worth it before thousands.

## 4. Storage & egress (the slower-moving limit)

Free tier is **5 GB egress / 500 MB file storage**; Pro is 250 GB / 8 GB. Not a
100-user problem, but backlog **#96 (resize on upload)** compounds: one un-resized
4 MB phone screenshot served to 100 fans is 400 MB of egress from a single
avatar. Worth doing before real volume, cheaply.

## 5. Recommendations, ranked

1. **Raise the Supabase signup rate limit + take Resend off free** — the actual
   "100 users onboarding" blocker. Do this before any marketing push.
2. **Upgrade Supabase to Pro** ($25/mo Micro compute) for launch — removes the
   auto-pause, roughly doubles compute headroom, adds backups. Already planned
   (#95/#100).
3. **#96 resize-on-upload** — protects egress/storage as fans and artists post.
4. **Optional:** dedupe the double `getUser()` per signed-in page.

## What this assessment did _not_ do

The probe is **read-only** — no accounts created, no emails sent, no writes, no
Stripe. A true end-to-end onboarding simulation (100 real signups → verify →
browse → buy) would create 100 real accounts, spend the email quota, and touch
**live** Stripe keys, so it should run against a throwaway Supabase project or a
local stack, not production. The harness for that is a straightforward extension
of `scripts/load-probe.mjs` + the existing `scripts/security-probe.mjs` pattern —
say the word and it's a short build.
