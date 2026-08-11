---
name: db-migration
description: Write and ship a Supabase schema change for MadGigz the safe way. Use when adding or altering a table, column, RLS policy, grant, function, or trigger — anything that becomes a numbered `supabase/addendum_*.sql`. Covers the column-GRANT rule, the two-phase revoke, the drop-policy-name trap, graceful degradation, the fresh-DB setup file, and the staging-then-prod run order.
---

# Ship a Supabase migration safely

Migrations here are **hand-run numbered SQL files**, not an automated runner.
There is no `supabase migrate`. The discipline below is what keeps a change from
silently breaking the live app. The authoritative prose is in `CLAUDE.md`; this
is the checklist form.

## 1. Name and place the file

- `supabase/addendum_NNN_short_name.sql`, where `NNN` is the next number after
  the highest existing `addendum_*` (check `ls supabase/ | sort`). Never reuse a
  number — a number means the same thing across every past conversation.
- Start with a comment block: what it does, *why*, and whether it's safe to run
  on a live DB or needs the two-phase split (below).

## 2. Classify every column you add — public / owner-only / service-role-only

RLS is **row-level; it does not hide columns**. A `using (true)` select policy
grants the *whole row*. So for each new column decide:

- **public** → readable by anyone. `public.profiles` has **column-level GRANTs**,
  so a new publicly-readable profile column needs BOTH the `alter table` AND
  `grant select (new_col) on public.profiles to anon, authenticated`. Postgres
  does not extend column grants to later-added columns — forget it and the field
  reads as a mysterious `null`/`42501`, not an obvious error.
- **owner-only** → guard with an RLS policy keyed on `auth.uid()`, or move it to
  its own table (the `artist_evidence` pattern) if it sits on a table that's
  otherwise public.
- **service-role-only** → don't grant it to anon/authenticated at all; the app
  reads a derived boolean instead (e.g. `stripe_account_connected`).

Sensitive personal data (DOB, fiscal IDs, Stripe account ids) is never a plain
public column.

## 3. If the migration REVOKEs anything, split it in two

A `revoke` (or a `drop` that removes access) takes effect immediately and breaks
whatever is currently deployed. Split into:

- an **additive** migration run *before* the deploy, and
- the **revoking** migration run *after* the deploy.

`addendum_017` / `addendum_018` are the worked example.

## 4. Dropping a policy uses its *current* name

`drop policy "old name"` on a name that no longer exists is a **silent no-op**,
and permissive policies are OR'd — a stale name leaves the old grant fully live
while the migration "succeeds". Find the real current name in the most recent
addendum that touched that policy, **not** in `schema.sql`.

## 5. Make the app degrade gracefully until the SQL is run

Code that needs the new table/column/function ships *before* the SQL runs by
hand. The calling code must catch the "missing" cases and fall back rather than
throw: `42P01` (table missing), `42883` (function missing), `42501` (grant
missing). `addendum_033`/`034` and their callers are the pattern.

## 6. Update the fresh-DB setup file

Append the new addendum to `supabase/staging_full_setup.sql` (schema + every
addendum concatenated, one-paste build for a brand-new project) with its
`-- ####### addendum_NNN_name.sql #######` delimiter, so a fresh staging DB
still builds from one paste.

## 7. Run order: staging first, then prod

The user runs the SQL in the Supabase SQL editor by hand. Flow:
**staging project → verify on the staging URL → promote code → run the same SQL
on prod.** Guide them; never assume it ran. `/api/health` and a read-back check
confirm it landed.

**Never `drop schema public cascade` to reset a Supabase project** — it wipes the
default table grants for `anon`/`authenticated` and silently breaks logged-in
writes while RLS still looks fine. Recreate the project instead.

## 8. Verify from OUTSIDE the app, reading the value back

The anon key ships in the browser bundle, so "the app doesn't request that
column" is not a control. Check the real API, and after any policy/grant change
re-run the adversarial probes (see the `adversarial-probe` skill). An `UPDATE`
matching zero rows returns **no error**, so "did it error?" reports a locked door
as a hole — always read the stored value back.

```bash
URL=$(grep NEXT_PUBLIC_SUPABASE_URL .env.local | cut -d= -f2-)
KEY=$(grep NEXT_PUBLIC_SUPABASE_ANON_KEY .env.local | cut -d= -f2-)
curl -s "$URL/rest/v1/profiles?select=some_new_col&limit=3" -H "apikey: $KEY"
```
