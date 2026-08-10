# Admin "act as any user" (impersonation)

_Added 10 Aug 2026, for the testing phase. A way for an admin to open the app as
any user — to reproduce what they see and hit the bugs they hit, without asking
them or running scripts._

## It is OFF by default — turn it on deliberately

The whole feature is gated behind one server-only env var:

```
ALLOW_ADMIN_IMPERSONATION=true
```

- **Unset (production default):** the "Act as" button doesn't render and the
  server action refuses even if called directly. The code is inert.
- **Set to `true`:** the button appears on the admin user page and works.

To use it on the deployed app: add `ALLOW_ADMIN_IMPERSONATION=true` in **Vercel →
Settings → Environment Variables** (Production), then redeploy. **Remove it
before go-live (#95)** — that closes the backdoor with no code change. For local
dev, add the same line to `.env.local`.

## How to use it

1. Sign in as the admin account.
2. Go to **/admin/users**, open a user.
3. Click **Act as @username** → you're dropped into the app as them (their feed,
   profile, tickets, notifications).
4. A **"Viewing as @username (admin)"** bar sits across the top the whole time.
5. Click **Exit** on that bar → you're signed out and sent to the sign-in
   screen; sign back in as admin to return.

## Why it's built this way (the safety notes)

- **No passwords, no forged tokens.** It mints a one-time Supabase magic link for
  the target with the service-role key and verifies it server-side, which swaps
  the session cookies. Standard Supabase mechanism.
- **Admin-only.** Every action calls `requireAdmin()` first; the button is
  hidden for non-admins and the flag-check refuses direct calls.
- **The target account is never modified.** Impersonation is read/act-as; it
  changes nothing on their profile.
- **Exit signs out rather than restoring admin.** Supabase is one session per
  browser, so acting as someone replaces the admin session. Returning means
  signing back in. That's the safe trade — the alternative (stashing an admin
  login token in a cookie to hop back seamlessly) means a live admin credential
  sitting in the browser, which isn't worth it for a testing tool.
- **You act AS them.** Anything you do while impersonating is real and done as
  that user (a purchase, a follow, a post). The banner is the reminder.

## Removing it entirely later

If it's not wanted after testing: delete
`src/app/admin/users/impersonation-actions.ts`,
`impersonation-config.ts`, `ActAsButton.tsx`,
`src/components/ImpersonationBanner.tsx`, the button block in
`src/app/admin/users/[userId]/page.tsx`, and the banner block in
`src/app/(app)/layout.tsx`. Until then, leaving the env var unset is enough to
keep it dark in production.
