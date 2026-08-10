# MadGigz — secret inventory & key-rotation runbook

_Written 10 Aug 2026. Backlog #103. Every secret the app holds, what breaks if
it leaks, and how to swap it **without taking the app down**. Grounded in the
actual env the code reads (`grep process.env`), not a generic template._

## The one rule that matters: rotate in this order

A secret the app reads has a live copy in three possible places — the
**provider** that issued it, **Vercel's environment** (what the running app
reads), and sometimes a **second dashboard** (Supabase, for OAuth). If you
revoke the old value before the new one is deployed, the app is down in the gap.

So every rotation below follows the same **two-phase order** — the same
discipline the database migrations use (`CLAUDE.md`: "migrations that revoke
need two phases"):

1. **Create** the new secret at the provider. Old and new are now both valid.
2. **Update** the value in Vercel → Settings → Environment Variables (Production,
   and Preview if it differs).
3. **Redeploy.** Env changes do **not** reach running functions until a new
   deployment — Vercel bakes env into the build. Trigger a redeploy of the
   latest commit (Vercel → Deployments → ⋯ → Redeploy).
4. **Verify** `https://<app>/api/health` returns `"ok": true`, the expected
   `commit`, and the rotated key showing `"ok"` (not `missing` / `wrong-format`).
   Then exercise the one path that key guards (see each entry).
5. **Revoke** the old secret at the provider. Only now.

Never do 5 before 4. If you ever do 5 first — a suspected leak — see
[Emergency](#emergency-a-key-is-already-leaked) at the bottom; that's the one
case where a brief outage is the right trade.

## Where each secret lives

Three planes. Knowing which one a secret lives in tells you where step 1 and
step 5 happen:

| Plane | Holds | Rotate at |
|---|---|---|
| **Vercel env** | everything the app reads (all rows below except Google OAuth) | Vercel dashboard |
| **Supabase dashboard** | the JWT secret behind the two Supabase keys; the Google OAuth client id/secret; the redirect allow-list | supabase.com project settings |
| **Provider dashboards** | Stripe (keys + webhook secrets), Cloudflare (Turnstile), Resend (email), Google Cloud (OAuth) | each provider |

Public values (`NEXT_PUBLIC_*`) still live in Vercel env, but leaking one is not
an incident — they ship in the browser bundle by design. They're listed so the
inventory is complete, not because they need guarding.

## Inventory — blast radius if leaked

| Secret (env var) | What it is | Public? | If it leaks |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase key that **bypasses RLS** | **No — highest value** | Full read/write to every table, every user's data. Rotate first, always. |
| `STRIPE_SECRET_KEY` | Server Stripe key (`sk_…`) | **No — highest value** | Create charges/refunds, read all payment data, move money. Rotate first. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser Supabase key, RLS-scoped | Yes (shipped in bundle) | Nothing beyond what RLS already allows anon. Not an incident by itself — but see the JWT-secret caveat below. |
| `STRIPE_WEBHOOK_SECRET` | Signs Stripe → app account-event webhooks (`whsec_…`) | No | Attacker could forge "payment succeeded" and issue tickets without paying. |
| `STRIPE_WEBHOOK_SECRET_CONNECT` | Same, for connected-account (Connect) events | No | Forge account/payout status changes. |
| `RESEND_API_KEY` | Sends all transactional email (`re_…`) | No | Send mail as `@aurasonic.es` — phishing from your domain. |
| `TURNSTILE_SECRET_KEY` | Cloudflare captcha server verify (`0x…`) | No | Bypass signup captcha (bot signups). App falls back to no-captcha if unset. |
| `CRON_SECRET` | Shared secret guarding the cron routes | No | Trigger scheduled jobs (e.g. past-event sweep) on demand. |
| Google OAuth **client secret** | Google sign-in — **lives in the Supabase dashboard, not Vercel env** | No | Impersonate the app to Google's OAuth. Rotate in Google Cloud → paste into Supabase. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Browser Stripe key (`pk_…`) | Yes | Public by design. Rotate only alongside the secret key. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Browser captcha widget key | Yes | Public by design. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_MADGIGZ_*` | Project URL, site origin, pricing config | Yes | Not secrets. Listed for completeness. |

`RESEND_FROM_EMAIL` and `SUPPORT_EMAIL` are addresses with safe defaults in
`src/lib/email.ts`, not secrets.

## Per-secret rotation

Each follows the [five-step order](#the-one-rule-that-matters-rotate-in-this-order).
Only the provider-specific "create" and "revoke" and the "verify" path differ.

### Supabase keys (`anon` + `service_role`) — the heavy one

**These two cannot be rotated independently or invisibly.** Both are JWTs signed
by the project's JWT secret; rotating that secret (Supabase → Settings → API →
JWT / API keys) changes **both keys at once and invalidates every active user
session** — everyone is signed out. It is not zero-downtime like the others.

- **Plan it as a maintenance moment**, not a routine swap. Announce it if users
  are active.
- Order still holds: get the new keys, update **both** `SUPABASE_SERVICE_ROLE_KEY`
  and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel, redeploy, verify `/api/health`,
  then the old keys are already dead (JWT rotation is atomic — there is no "old
  still valid" window, which is exactly why it logs everyone out).
- **Verify:** load the app signed-out (anon reads work), then sign in fresh
  (service paths + a new session work), then run `scripts/security-probe.mjs`.
- If newer Supabase "publishable/secret API keys" are enabled on the project,
  prefer those — they rotate independently without the session wipe. Check the
  API settings page before assuming the JWT-secret path.

### Stripe secret + publishable key

- **Create:** Stripe → Developers → API keys → **Roll** the secret key. Stripe
  lets you keep the old key working for up to 24h — a built-in phase 1.
- Update `STRIPE_SECRET_KEY` (and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` if you
  rolled it too) in Vercel, redeploy.
- **Verify:** `/api/health` shows `STRIPE_SECRET_KEY: ok`, then as an artist open
  **Connect payouts** (the call that first surfaced a bad key historically), and
  as a fan run one test-mode purchase end-to-end.
- **Revoke:** expire the old key in the Stripe roll dialog.

### Stripe webhook signing secrets (both endpoints)

- **Create:** Stripe → Developers → Webhooks → the endpoint → **Roll signing
  secret** (old stays valid ~24h). Do this for **both** the account endpoint
  (`STRIPE_WEBHOOK_SECRET`) and the Connect endpoint
  (`STRIPE_WEBHOOK_SECRET_CONNECT`).
- Helpful quirk: the webhook route tries **both** secrets against each request
  (`src/app/api/stripe/webhook/route.ts`), so a window where old and new coexist
  verifies fine either way.
- Update in Vercel, redeploy, verify with a Stripe **"Send test event"** →
  confirm a 200 and a fulfilled test ticket. Then revoke the old secret.

### Resend API key

- **Create** a new key in Resend → API Keys. Update `RESEND_API_KEY`, redeploy.
- **Verify:** trigger one real email (a signup, or the feedback path). Then
  **delete** the old key in Resend.

### Cloudflare Turnstile (secret + site key)

- **Create/rotate** in Cloudflare → Turnstile → the widget. Update
  `TURNSTILE_SECRET_KEY` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` together, redeploy.
- **Verify:** load `/signup` and confirm the captcha renders and a signup
  completes. (Both are optional — if unset, signup falls back to no captcha.)

### CRON_SECRET (self-generated, no provider)

We own both ends, so "create" is just generating a value:
```bash
openssl rand -hex 32
```
- Set the new value in Vercel env, redeploy, then update whatever calls the cron
  route with the matching header (the Vercel Cron config / any external
  scheduler). Because there's no provider to revoke at, the old value dies the
  moment nothing sends it.
- **Verify:** the guarded cron route returns 200 with the new secret and 401
  without it.

### Google OAuth client secret (not in Vercel!)

This one is the easy trap — it is **not** a Vercel env var:
- **Create:** Google Cloud Console → APIs & Services → Credentials → the OAuth
  2.0 client → **Reset secret**.
- **Update:** paste it into **Supabase → Authentication → Providers → Google**
  (client id usually unchanged). No Vercel redeploy needed — the app never sees
  this secret; Supabase does the OAuth exchange.
- Google's redirect URI is Supabase's `/auth/v1/callback` and does **not** move
  when the app's domain changes (relevant to #95 go-live).
- **Verify:** sign in with Google end-to-end.

## When you're doing #95 (go-live) anyway

Going live on `madgigz.aurasonic.es` already forces part of this list:
- **New Stripe live keys** (`STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`)
  — test-mode keys don't carry to live.
- **A fresh webhook endpoint** on the new URL with **its own** signing secret(s)
  — test-mode webhooks do not carry over. Missing this = money taken, no ticket.
- `NEXT_PUBLIC_APP_URL` updated, and the new origin added to Supabase's redirect
  allow-list (see the #95 note in `BACKLOG.md`).

So the Stripe rows above and the go-live checklist are the same work — do them
together once.

## Verification, every time

After any rotation, before you revoke the old value:

1. `curl https://<app>/api/health` → `"ok": true`, `commit` matches the redeploy,
   the rotated key shows `"ok"`. This endpoint reports **presence and prefix
   only, never values** — safe to hit publicly.
2. Exercise the one path that key guards (listed per entry above).
3. After a policy/grant-adjacent change, re-run the adversarial probes in
   `scripts/` (`security-probe.mjs`, `probe-artist-side.mjs`) — they create and
   delete their own throwaway accounts, and each reads the stored value back so a
   locked door isn't misreported as open.

## Emergency: a key is already leaked

A secret that's *already* public can't wait for the graceful order — the gap you
avoid in a planned rotation is smaller than the exposure. So invert it:

1. **Revoke immediately** at the provider, accepting a brief break of that one
   path. Prioritise by blast radius: `SUPABASE_SERVICE_ROLE_KEY` and
   `STRIPE_SECRET_KEY` first — they're unrestricted.
2. Create the replacement, update Vercel, redeploy, verify `/api/health`.
3. Check for damage in the provider dashboard (unexpected Stripe charges/refunds,
   Supabase rows) for the exposure window.
4. If it was committed to git, rotating is necessary but **not** sufficient — the
   old value is in history. Rotate regardless; scrubbing history is secondary.

The service-role key and Stripe secret are the two worth a middle-of-the-night
rotation. The public `NEXT_PUBLIC_*` values are not — they were never secret.
