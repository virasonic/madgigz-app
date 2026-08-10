---
name: simulate-users
description: Load-test and end-to-end-test MadGigz with many synthetic users onboarding and using the app at once. Use when asked to simulate users, stress-test, load-test, check how many concurrent users the app or servers can handle, or verify onboarding + browsing holds up under concurrency. Runs scripts/simulate-users.mjs.
---

# Simulate many users onboarding and using the app

Spins up a self-contained synthetic **cohort** — a few sim "artists" (approved,
each with a show) and many sim "fans" — has the fans onboard and use the app the
way a real session does (sign in → load feed → load explore → follow an artist →
save a show → check notifications), measures how each holds up as concurrency
climbs, then deletes the entire cohort.

The harness is `scripts/simulate-users.mjs`. This skill is how to drive it.

## When to use

- "Simulate 100 users onboarding and using the app."
- "Can the servers handle N people at once?" / "stress test" / "load test".
- Verifying a schema/RLS change still performs under concurrency after a migration.

For a **read-only, no-writes** browsing probe (safe anywhere, no accounts), use
`scripts/load-probe.mjs` instead — it's lighter and touches nothing. This skill
is the heavier one that also exercises **onboarding and authed writes**.

## Safety model — read before running

This is the honest reason it's safe to point at the live project (same basis as
the `security-probe.mjs` / `probe-artist-side.mjs` scripts that already create
and delete throwaway accounts here):

- **No email is ever sent.** Users are created with the Admin API
  (`email_confirm: true`), which skips the confirmation email entirely. That is
  deliberate: it sidesteps the Supabase custom-SMTP signup limit (30/hour) and
  Resend's daily cap that gate *real* onboarding, so the sim measures the
  database and compute rather than bouncing off the email wall. (Those email
  limits are a real launch consideration — see `docs/load-and-capacity.md` — but
  they're config, not something this sim needs to hit.)
- **No money, no Stripe.** The sim never calls checkout. Ticket *purchase* is a
  Stripe redirect and is intentionally **out of scope** (see "deliberate cuts").
- **Every sim account is tagged and torn down.** Emails end
  `@madgigz-loadtest.invalid`; sim shows are titled `LOADTEST — …`. Teardown runs
  in a `finally` and deleting an auth user cascades their follows/saves/tickets.
  A `--cleanup` mode sweeps anything a crashed run left behind.
- **No real user is touched.** Fans only ever follow **sim** artists, so no real
  artist gets a phantom "new follower" notification.
- **Dry-run by default.** Without `--go` it explains the plan, checks
  connectivity, and creates nothing.

It does still create real (throwaway) rows on whatever project `.env.local`
points at — currently production. That's expected and reversible, but it is a
write against the live DB, so **running `--go` will prompt for permission**. If a
`.env.staging` with its own Supabase project exists, prefer `--env=.env.staging`.

## How to run

Always start with the dry run to confirm the target and cohort size:

```bash
node scripts/simulate-users.mjs
```

Then execute. Start small to prove the lifecycle (and that teardown is clean),
before a big run:

```bash
node scripts/simulate-users.mjs --go --users=6 --concurrency=1,3,6 --rounds=2
```

The headline "100 users" run:

```bash
node scripts/simulate-users.mjs --go --users=100 --concurrency=1,10,30,60
```

Flags:
- `--go` — actually run (omit for a dry run).
- `--users=N` — cohort size (default 25). ~10% become artists, the rest fans.
- `--concurrency=a,b,c` — concurrency levels for the activity ramp (default `1,10,25`). Levels above the fan count are skipped.
- `--rounds=N` — rounds per concurrency level (default 3); more rounds = more samples.
- `--env=FILE` — env file to read Supabase keys from (default `.env.local`).
- `--cleanup` — delete any leftover `@madgigz-loadtest.invalid` accounts + `LOADTEST — ` shows, then exit. Run this if a previous run was interrupted.

## Reading the output

Three tables:
1. **Phase 1 — onboarding:** users/sec, and per-`createUser` p50/p95/max + errors.
   This is the "100 people signing up at once" number (email aside). Watch for
   errors here — the username-uniqueness path runs a loop, so heavy concurrency
   is where contention would show.
2. **Phase 2 — activity ramp:** whole-session p50/p95/max/errors at each
   concurrency level. Graceful degradation (latency creeps up) is fine; a cliff
   or rising errors is the finding.
3. **Per-operation latency:** which of signIn / feedLoad / exploreLoad / follow /
   save / notifications is the slow one. `feedLoad` fires six queries in
   parallel, so it's the natural ceiling.

Compare against `docs/load-and-capacity.md`, which recorded the read-only
baseline. If you run a notable simulation, add a dated row there so the trend is
visible over time.

## Deliberate cuts (features, not gaps)

- **No ticket purchase.** That path is a Stripe Checkout redirect; simulating it
  needs Stripe test mode + a headless browser and moves it from "load probe" to
  "browser E2E". If asked to include real purchases, that's a separate build on
  Stripe test keys against a **non-production** project — flag it, don't point it
  at live money infrastructure.
- **Admin-API onboarding, not the real signup form.** This tests the DB trigger,
  profile creation, and RLS under load — not the signup UI or captcha. The UI is
  better covered by a browser walkthrough.
- **Provisioning is capped at concurrency 10** regardless of `--users`, to avoid
  hammering GoTrue's admin endpoint; the activity phase is where real concurrency
  is measured.

## After running

Confirm teardown reported deleting everything it created. If in any doubt, run
`node scripts/simulate-users.mjs --cleanup` — it's idempotent and safe to run
anytime. You can also verify nothing is left:

```bash
node scripts/simulate-users.mjs --cleanup
```
It should report `removed 0` on a clean project.
