# Staging / pre-production environment (#108)

_A second, **locked** copy of the app that runs the real stack — its own
Supabase database, Stripe **test** mode, its own keys — so a big change can be
exercised end-to-end **before** it touches the live site. Decided 11 Aug 2026:
same Vercel project, a long-lived `staging` git branch that deploys as a locked
Preview, viewable only by your Vercel login._

## This project's staging (resolved 11 Aug 2026)
- **Staging app (bookmark this):** https://madgigz-app-git-staging-aura-sonic.vercel.app
- **Staging Supabase host:** `tbbhuzgqsbdbskugkngf.supabase.co` (prod is
  `rxtiagsypwvuyyihbhal.supabase.co` — they must differ, see `/api/health`).
- **Branch:** `staging` · **Stripe:** test · **Lock:** Vercel Authentication.
- The per-deployment URL (random letters, e.g. `madgigz-knf1mrjux-…`) changes
  every build — ignore it; always use the `git-staging` address above.

## The mental model

- **`main` branch → madgigz.aurasonic.es → real users.** Don't test here.
- **`staging` branch → a locked `…-git-staging-….vercel.app` URL → a throwaway
  database.** Break whatever you like here.

The everyday flow becomes:

```
make a change  →  push it to `staging`  →  open the locked staging URL, test it
→  happy?  →  merge `staging` into `main`  →  it goes live
```

Nothing about staging costs real money (Stripe stays in test mode) and nothing
staging does can touch production data — **as long as the env vars are scoped
right**, which is the one thing to get correct below.

## ⚠️ The one real danger: env-var scope

Vercel lets one variable hold **different values per environment**
(Production / Preview / Development). Staging is a **Preview** deployment.

If a production variable — especially `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY` — is set to **"All
Environments"**, then your staging Preview inherits the **production** value and
becomes a second front door to the **live database**. That defeats the whole
point.

**The rule:** every variable in the table below must have a **Preview-scoped**
value pointing at staging. Where a prod variable is currently "All
Environments", edit it to **Production only**, then add a separate **Preview**
entry with the staging value.

We can *prove* it's right afterwards: `/api/health` now reports `supabaseHost`.
Prod and staging must show **different** hosts. If staging shows the prod host,
a variable is still leaking — fix its scope.

---

## Setup — do these once

Steps marked **(you)** are in your dashboards and need your login. The last code
step (pushing the branch) is **(me)** — tell me once your Preview env vars are
set and I'll push.

### 1. Create a separate staging Supabase project — **(you)**
Supabase → **New project** (same org is fine). Name it `madgigz-staging` so it's
never confused with prod. Pick a region near you. Save the database password.

When it's up, from **Settings → API** copy three values for step 4:
- **Project URL** (`https://<ref>.supabase.co`) → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role** key (secret) → `SUPABASE_SERVICE_ROLE_KEY`

### 2. Build the staging database in one paste — **(you)**
Staging Supabase → **SQL Editor → New query** → open
[`supabase/staging_full_setup.sql`](../supabase/staging_full_setup.sql), paste
the **whole** file, **Run**. That one file is `schema.sql` + every `addendum_*`
in order — it creates all tables, RLS policies, column grants, and the storage
buckets. A fresh green run means the schema now matches production exactly.

(If you later add a new `addendum_NNN` for a real change, regenerate this file by
concatenating `schema.sql` + the addenda in numeric order, or just run the new
addendum against staging the same way you would against prod.)

### 3. Point staging Supabase auth at the staging URL — **(you)**
You'll know the staging URL after step 6; come back and set this then.
Staging Supabase → **Authentication → URL Configuration**:
- **Site URL**: the staging `…vercel.app` URL from step 6.
- **Redirect URLs**: add `<staging-url>/**`.

Skip it and email-confirmation / Google sign-in on staging bounce people to the
root with no session. (Google sign-in also needs the staging Supabase callback
added in Google Cloud if you want to test it — optional for now.)

### 4. Add the staging env vars in Vercel — **Preview scope** — **(you)**
Vercel → the project → **Settings → Environment Variables**. For each row below,
add the value with the **Preview** checkbox ticked (and Production/Development
**un**ticked). Re-read the scope warning above first.

| Variable | Staging value | Needed? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | staging project URL (step 1) | required |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | staging anon key | required |
| `SUPABASE_SERVICE_ROLE_KEY` | staging service_role key | required |
| `STRIPE_SECRET_KEY` | your `sk_test_…` key (reuse prod's test key) | required |
| `STRIPE_WEBHOOK_SECRET` | staging test webhook secret (step 5) | required |
| `STRIPE_WEBHOOK_SECRET_CONNECT` | staging Connect webhook secret (step 5) | if testing payouts |
| `RESEND_API_KEY` | `re_…` (reuse prod's, or a separate key) | required for emails |
| `RESEND_FROM_EMAIL` | same as prod | required for emails |
| `SUPPORT_EMAIL` | same as prod | recommended |
| `NEXT_PUBLIC_APP_URL` | the staging URL (step 6) | required |
| `CRON_SECRET` | a **new** random string (not prod's) | required |
| `ALLOW_ADMIN_IMPERSONATION` | `true` (fine on a test env) | optional |
| `NEXT_PUBLIC_TURNSTILE_*` | leave unset to skip captcha on staging | optional |

The `.env.staging.example` file on disk is the same list for local script runs
(the probes and the `simulate-users` skill read `.env.staging`).

### 5. Confirm the Preview lock is on — **(you)**
Vercel → **Settings → Deployment Protection**. Ensure **Vercel Authentication**
(a.k.a. Standard Protection) is **on for Preview** deployments — it usually is by
default. That's the "locked browser": only someone logged into your Vercel
account can open the staging URL. No password to manage. (To let a non-Vercel
tester in later, you'd invite them to the Vercel team or move to Pro's password
protection — see the backlog note.)

### 6. Push the `staging` branch — **(me)**
Once your Preview env vars are set, tell me and I'll `git push` the `staging`
branch. Vercel builds it as a locked Preview and gives you the stable staging
URL (`madgigz-app-git-staging-<you>.vercel.app`). Then go back and fill the
staging URL into steps 3 and 4 (`NEXT_PUBLIC_APP_URL`) and redeploy.

### 7. Add the staging Stripe **test** webhook — **(you)**
Needs the staging URL from step 6. Stripe **test** dashboard → **Developers →
Webhooks → Add endpoint** → URL `<staging-url>/api/stripe/webhook`, select the
same events prod uses (`checkout.session.completed`, `checkout.session.expired`,
`account.updated`, and the async-payment ones). Copy its **signing secret** into
`STRIPE_WEBHOOK_SECRET` (Preview scope). Without this, staging checkouts take
(fake) money and never issue a ticket — the same quiet failure as prod.

---

## Verify staging is real and isolated
Once the branch is pushed and env is set:

1. Open the staging URL in a browser where you're logged into Vercel → it loads.
   Open it logged-out (or incognito) → Vercel's login wall blocks it. **Locked.**
2. Open `<staging-url>/api/health`:
   - `"ok": true`
   - `appUrl` is the **staging** URL
   - `supabaseHost` is the **staging** `<ref>.supabase.co` — **not** the prod
     host (open prod's `/api/health` in another tab and compare; they must
     differ). This is the proof that staging ≠ prod.
   - `stripeMode` is `"test"`.
3. Staging shows **no real users/shows** (it's a fresh DB) while prod is full —
   another quick confirmation they're separate stacks.
4. Sign up a throwaway account on staging → it lands in the staging DB only.

## Promoting a change to production
When a change tested on `staging` is good: merge `staging` → `main` (or
cherry-pick the commits), push `main`, and the normal prod deploy carries it
live. The tooling files added for staging (`supabase/staging_full_setup.sql`,
this doc, the `/api/health` `supabaseHost` field) ride along on that first merge.

## Notes
- **Emails:** a fresh Supabase project's default email sender is heavily rate
  limited (a few per hour). Fine for occasional test signups; for a load test
  point staging at your own Resend SMTP or raise the limit (see
  `docs/load-and-capacity.md`).
- **Cost:** a second Supabase project on the free tier is €0. Preview
  deployments don't add Vercel cost. Only a marketing-scale load test would push
  either past free.
- **Secrets:** staging holds its own set of the same secrets — include it when
  rotating (see `docs/key-rotation.md`).
