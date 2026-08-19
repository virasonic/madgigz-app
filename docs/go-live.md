# Go live on madgigz.aurasonic.es (#95)

_Domain-first launch. Decided 11 Aug 2026: put the app on the subdomain with
**Stripe still in test mode** — real signups, shows and browsing, but checkout
uses test cards (no real money). Flipping on real payments is a separate step
(see the bottom)._

**Nothing in the code changes to move domains** — `siteOrigin()`
(`src/lib/site.ts`) reads `NEXT_PUBLIC_APP_URL`, and the Stripe webhook path is
already excluded from middleware. This is all dashboard + env work. The only
code touch was pointing the two email-template logos at the new domain.

Each step says who does it. Steps marked **(you)** are in your dashboards and
need your login; I can't do those.

## The order (each fails quietly if skipped, so don't skip)

### 1. Add the domain in Vercel — **(you)**
Vercel → the project → **Settings → Domains → Add** → type
`madgigz.aurasonic.es`. Vercel then shows a **DNS record** to create (a CNAME for
a subdomain, usually `cname.vercel-dns.com`). Copy what it shows.

### 2. Add that DNS record where aurasonic.es is managed — **(you)**
At your domain registrar / DNS host for `aurasonic.es`, add the record Vercel
gave you:
- Type **CNAME**, Name/Host **`madgigz`**, Value **`cname.vercel-dns.com`** (use
  exactly what Vercel showed).
- Leave the apex `aurasonic.es` alone — that's for your main AuraSonic site.

Back in Vercel the domain flips to **Valid** within minutes (can take up to an
hour). Vercel issues the HTTPS certificate automatically — nothing to do there.

### 3. Set `NEXT_PUBLIC_APP_URL` in Vercel — **(you)**
Vercel → **Settings → Environment Variables** → add/update, **Production** scope:
```
NEXT_PUBLIC_APP_URL = https://madgigz.aurasonic.es
```
This is what makes shared event links and link previews use the new domain. Skip
it and shares keep pointing at the `.vercel.app` host — still works, so nobody
notices for weeks. That's the quiet failure.

### 4. Update Supabase URL config — **(you)**
Supabase → **Authentication → URL Configuration**:
- **Site URL**: `https://madgigz.aurasonic.es`
- **Redirect URLs**: add `https://madgigz.aurasonic.es/**`. Keep the existing
  `.vercel.app` entry too for now, so nothing breaks mid-switch.

Miss this and Google sign-in drops people back at the site root with no session.
**Google Cloud needs no change** — its redirect URI is Supabase's
`/auth/v1/callback`, which doesn't move with the app's domain.

### 5. Redeploy — **(you)**
Env-var changes only take effect on a new deployment. Vercel → **Deployments →
⋯ → Redeploy** the latest. (Adding the env var often offers a redeploy — that's
fine.)

### 6. Re-paste the email templates (optional, tidy) — **(you)**
The two templates in `supabase/email-templates/` now reference the logo at the
new domain. To use them, copy each into Supabase → **Authentication → Email
Templates** (confirmation + reset password). Skipping this is harmless — the old
`.vercel.app` logo URL still loads — so do it whenever.

## Verify it worked
Once the redeploy is done:
1. Open **https://madgigz.aurasonic.es** — the app loads over HTTPS.
2. Open **https://madgigz.aurasonic.es/api/health** — `"ok": true`, `appUrl` is
   the new domain, `commit` matches your latest.
3. Sign in with **Google** — you come back signed in, not dumped at the root.
4. Open a show → **Share** → the link is `https://madgigz.aurasonic.es/e/…`.
5. Sign up a fresh test account → the confirmation email arrives and works.

**Gotcha — signup captcha is Cloudflare Turnstile, and a domain change breaks
it.** The signup form's Turnstile widget only runs on **hostnames allow-listed
in the Cloudflare → Turnstile dashboard** (that widget → Hostname Management).
If the app's host isn't listed, the widget throws **error `110200`** (a
"can't connect to Cloudflare" box) and — because signup requires the token —
**email sign-up silently fails** while Google/Apple (no captcha) keep working.
Hit exactly this after moving to `madgigz.aurasonic.es`; fixed by adding that
hostname. So on any future domain move, add the new host here too. Keep
`localhost` listed for local dev.

## Two things to decide, not blockers
- **Impersonation flag.** You set `ALLOW_ADMIN_IMPERSONATION=true` in Vercel to
  test the "act as any user" tool. With real users arriving, decide whether to
  keep it (still testing) or unset it — it's a live admin backdoor either way.
  See `docs/impersonation.md`.
- **Before a marketing push** (not for a soft launch): raise the Supabase Auth
  signup rate limit (default **30/hour**) and move Resend off the free tier
  (**100 emails/day**). These gate a crowd onboarding at once, not a trickle —
  see `docs/load-and-capacity.md`.

## Google OAuth branding — custom auth domain (#122, done 12 Aug 2026)
The Google sign-in screen used to read "to continue to
`rxtiagsypwvuyyihbhal.supabase.co`" — Google prints the real OAuth redirect
host, and only shows a name for a domain you can prove you own, which you can't
for `supabase.co`. Fixed by giving the **prod** Supabase project a custom domain
so auth runs on a domain we own. The order matters — do it exactly this way or
live Google logins break:

1. **Supabase → prod project → Custom Domains add-on** (~$10/mo). Enter
   `auth.aurasonic.es`; it hands you a **CNAME** (`auth` → `rxtiagsypwvuyyihbhal.supabase.co`).
2. **GoDaddy** (aurasonic.es DNS) → add that CNAME → back in Supabase **Activate**
   (retain the CNAME afterwards; it says so).
3. **Google Cloud → OAuth client → Authorized redirect URIs** → **add**
   `https://auth.aurasonic.es/auth/v1/callback`, **keeping** the old
   `…supabase.co/auth/v1/callback` during the transition.
4. **Vercel → `NEXT_PUBLIC_SUPABASE_URL` = `https://auth.aurasonic.es`,
   Production scope ONLY.** Do **not** change Preview — that's staging and must
   keep its own Supabase URL, or staging writes to the prod DB (#108).
5. **Redeploy prod** (a push to `main` does it). `NEXT_PUBLIC_*` is inlined at
   **build** time, so the browser keeps the old URL until a rebuild — server
   routes flip immediately (runtime env), the client bundle only after redeploy.
6. **Verify:** `/api/health` → `supabaseHost: auth.aurasonic.es`; the authorize
   endpoint returns `redirect_uri=…auth.aurasonic.es/auth/v1/callback`; app +
   REST return 200 over the custom domain; a real Google sign-in shows
   "auth.aurasonic.es" and logs in.

Code note: media URLs saved under the old `…supabase.co` host are matched
host-agnostically now (`src/lib/supabase/storage.ts`, `account-deletion.ts` key
off the `/storage/v1/object/public/event-media/` marker, not the origin), so the
domain change doesn't strand pre-cutover objects. Staging stays on `supabase.co`
(its own project, no custom domain).

**Still open (separate from the domain):** the Google OAuth app must be
**published to Production** (OAuth consent screen → Publish app). While in
Testing, only added test users can sign in with Google — a launch blocker.
Non-sensitive scopes only, so no verification review is needed.

## Later: turning on real payments (the separate step)

**The code is mode-agnostic — nothing to build.** Every Stripe call keys off
whichever `STRIPE_SECRET_KEY` is set; the same code that passes test-mode
checkout runs live once the live keys + live webhooks are in place. `/api/health`
reports `stripeMode` so you can confirm the flip from outside. Audited ready
14 Aug 2026 (checkout = destination charge + application fee, atomic capacity
hold, idempotent fulfilment; webhook = dual-secret verify, paid-status gate,
async-method handling, seat release on expiry, `account.updated` payout sync).

Do these in order — each fails quietly if skipped:

**0. Settle tax first (#97).** Real money = IVA/invoicing obligations. Don't flip
until the gestor has signed off. The 21% VAT on the *platform fee* is already
computed and recorded per ticket (`application_fee_vat_cents`), but invoicing and
reporting are #97.

**1. Activate the Stripe account for live — (you).** Stripe → **Activate
payments**: AuraSonic SL business details, representative ID, and the **IBAN** for
payouts. Until the account is activated, live charges are rejected.

**2. Enable Connect in live — (you).** Settings → **Connect** → complete the live
platform profile (public name, support email, branding). Destination charges to
artists need Connect live-enabled, separately from account activation.

**3. Swap the keys in Vercel — (you), Production scope:**
```
STRIPE_SECRET_KEY = sk_live_…
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = pk_live_…
```

**4. Register the live webhooks — (you).** Test-mode endpoints do **not** carry
over. Two deliveries, **both** pointing at
`https://madgigz.aurasonic.es/api/stripe/webhook`:
- **Platform events** ("Events on your account"): `checkout.session.completed`,
  `checkout.session.async_payment_succeeded`, `checkout.session.expired`,
  `checkout.session.async_payment_failed` → signing secret into
  `STRIPE_WEBHOOK_SECRET`.
- **Connect events** ("Events on **connected** accounts"): `account.updated` →
  signing secret into `STRIPE_WEBHOOK_SECRET_CONNECT`.

A missing endpoint means money taken and **no ticket issued** — fulfilment is
webhook-driven.

**5. Redeploy — (you).** Env changes only take effect on a new deployment.

**6. Clear the stale test-mode Connect accounts — (SQL, right after the swap).**
`profiles.stripe_account_id` currently holds **test-mode** `acct_` ids (5 artists
as of 19 Aug 2026, 4 of them with `stripe_payouts_ready = true`). A live key
cannot see a test-mode account, and this fails in a way that has no route out
from the UI:

- `startPayoutOnboarding` only mints a new account **when the column is null**
  (`payout-actions.ts`), so an artist with a stale id gets "Something went wrong
  connecting to Stripe" on every click, forever.
- The 4 rows still flagged `stripe_payouts_ready` can publish paid shows whose
  checkout then dies at `transfer_data.destination` — no money is taken, the
  show is just unsellable.

So null them out in the **prod** Supabase SQL editor, after the keys are live:

```sql
update public.profiles
   set stripe_account_id = null,
       stripe_payouts_ready = false
 where stripe_account_id is not null;
```

Safe to run wholesale **only while no ticket has sold through Connect** — check
first, and if it returns anything, clear those rows individually instead:

```sql
select count(*) from public.tickets
 where stripe_account_id is not null and refunded = false;
```

This is a one-off data cleanup, not a schema change, so it is deliberately *not*
a numbered addendum and must **not** go into `staging_full_setup.sql` — a fresh
DB has no accounts to clear. Admin → Artists → **Reset payout account** does the
same thing per-artist and now survives the missing-account error too
(`resetArtistPayoutAccount`), but the bulk SQL is one step instead of five.

**7. Artists redo Connect onboarding for real — (you + artists).** Test
onboarding doesn't transfer; each artist completes live KYC + bank before they
can sell. `stripe_payouts_ready` flips automatically via the `account.updated`
webhook.

**8. Verify:** `/api/health` → `stripeMode: "live"`, `ok: true`, both webhook
secrets `ok`. Then buy **one real low-value ticket** end-to-end (checkout →
webhook fulfils → ticket + QR appears → the charge shows on the artist's
connected account minus the fee), and run **one real refund** from admin.

**9. Rotate** per `docs/key-rotation.md` (the Stripe rows are the same work).

**Nothing is mid-flight, so the window is wide open** (checked 19 Aug 2026): 0
tickets sold, and all 27 active events are `ticketing_mode = external` — they
link out to the promoter, so no in-app checkout runs today. There is no
half-finished order to strand and no artist balance to orphan. That changes the
moment the first in-app paid show goes on sale, so flip before then, not after.

### Prove it in sandbox first (all mode-agnostic, so test-mode proves the code)
- **Happy path:** paid checkout → `checkout.session.completed` → ticket + QR issued.
- **Capacity:** two buyers race for the last seat (only one wins); an abandoned
  checkout releases its held seat when it expires (~30 min).
- **Free + house:** a free event / 100%-off code issues directly; a house show
  takes no fee and makes no Connect transfer.
- **Discounts:** a percent and a fixed code, re-validated server-side.
- **Refunds:** full event cancel + per-ticket refund from admin → seat returns.
- **Connect:** an artist completes test onboarding end-to-end →
  `stripe_payouts_ready` flips → they can publish a paid show.

### Worth weighing before launch — Bizum (#144)
Checkout is **card-only** today (`payment_method_types: ["card"]` in
`checkout-actions.ts`). **Bizum** is the dominant consumer payment method in
Spain and would likely lift conversion for a Madrid audience; the webhook already
handles async methods, so it's a small change (enable in Stripe → add `"bizum"`
to the session). Tracked as #144.
