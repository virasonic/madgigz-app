---
name: adversarial-probe
description: Verify MadGigz's RLS policies and grants actually hold, from outside the app, by trying to do forbidden things and reading the result back. Use after any migration that touches a policy, grant, trigger, or security-definer function, or when checking whether a fan/artist can reach data or actions they shouldn't. Runs the scripts/*probe*.mjs scripts, which create and delete their own throwaway accounts.
---

# Probe the security model from outside the app

The anon key ships in the browser bundle, so "the app doesn't request that / the
button is hidden" is **not** a security control. The only real check is to hit
the API directly as a hostile client and confirm the database refused you. That's
what these scripts do.

## The scripts (in `scripts/`)

Each takes an env file as its first arg (defaults to `.env.local`), uses the
service-role key to set up + tear down throwaway accounts, and runs its checks as
the anon/authenticated user those accounts represent:

- `security-probe.mjs` — what a **fan** can reach/do (the baseline).
- `probe-artist-side.mjs` — what an **artist** can reach/do.
- `probe-feedback.mjs` — the feedback/support path.
- `probe-moderation.mjs` — content-moderation reports.
- `probe-username.mjs` — username uniqueness / change / cooldown rules.
- `load-probe.mjs` — read-only concurrency/latency probe (not security; safe
  anywhere, touches nothing).

```bash
node scripts/security-probe.mjs .env.local
node scripts/probe-artist-side.mjs .env.local
```

Run against `.env.local` (prod) is acceptable — same basis the scripts were built
on: they create and delete their own throwaway accounts, send no email, touch no
money. Point them at a staging env file to probe staging instead.

## When to run

- **After any migration that touches policies, grants, triggers, or
  security-definer functions** — this is the main trigger. See the `db-migration`
  skill, step 8.
- When asked "can a fan/artist do X they shouldn't?" or to check for a
  privilege-escalation or data-exposure hole.

## The one rule that makes them trustworthy: read the stored value back

An `UPDATE`/`INSERT` that matches **zero rows returns no error**. So a probe that
only asks "did it error?" will report a **locked door as a hole** (or a hole as
safe). Every check must **read the value back** and assert on what's actually
stored — e.g. after trying to escalate a role, re-select the row and confirm the
role did not change. When adding a new check to any probe, follow that pattern.

## After running

Everything should pass. A failure is a real finding — surface it, don't paper
over it. If you changed policies and a probe now fails, the migration is the
suspect, not the probe.
