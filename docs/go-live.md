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
When ready for real money — and after the IVA/tax question (#97) is settled:
- Swap Vercel's `STRIPE_SECRET_KEY` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` to the
  **live** keys.
- Register a **new webhook endpoint** in the Stripe **live** dashboard pointing
  at `https://madgigz.aurasonic.es/api/stripe/webhook`, and put its signing
  secret in `STRIPE_WEBHOOK_SECRET` (and the Connect one in
  `STRIPE_WEBHOOK_SECRET_CONNECT`). Test-mode webhooks do **not** carry over — a
  missing endpoint means money taken and no ticket issued.
- Artists must complete **real** Stripe Connect onboarding; test onboarding
  doesn't transfer.
- Rotate per `docs/key-rotation.md` (the Stripe rows and this are the same work).
