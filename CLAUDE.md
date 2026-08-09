@AGENTS.md

# Database conventions

## `profiles` has column-level GRANTs — new columns need granting

`public.profiles` no longer relies on a blanket table-level `select` for `anon`
and `authenticated`. `supabase/addendum_018_profile_column_grants.sql` revoked
that and replaced it with an explicit column list.

**Adding a publicly-readable column to `profiles` therefore takes two steps:**
the `alter table`, *and* a `grant select (new_column) on public.profiles to anon,
authenticated`. Postgres does not extend column-level grants to columns added
later. Forget the grant and the app gets a `42501` on that column — which
surfaces as a mysteriously empty field rather than an obvious error, so it is
worth checking first when a newly-added profile field reads as null.

It fails closed, which is the direction we want. `service_role` is unaffected,
so anything under `/admin` keeps working and won't reveal the mistake.

Columns deliberately **not** granted: `date_of_birth` (personal data, collected
for the 16+ age gate, read by nothing) and `stripe_account_id` (server-side
only; the UI reads the generated `stripe_account_connected` boolean instead).

## RLS is row-level — it does not hide columns

Both security holes found in this project so far were the same mistake: a
`using (true)` select policy on a table that also carried something sensitive.
A row policy grants the **whole row**. If a table mixes public and private
fields, RLS alone cannot protect it — use column GRANTs (as above) or move the
field to its own table (as `artist_evidence` did in `addendum_015`).

When adding any column, ask which of the three it is: public, owner-only, or
service-role-only. The first is the only one a permissive row policy handles.

## Verify RLS and grants from outside the app

The anon key ships in the browser bundle, so "the app doesn't request that
column" is not a control. Check the actual API:

```bash
URL=$(grep NEXT_PUBLIC_SUPABASE_URL .env.local | cut -d= -f2-)
KEY=$(grep NEXT_PUBLIC_SUPABASE_ANON_KEY .env.local | cut -d= -f2-)
curl -s "$URL/rest/v1/profiles?select=date_of_birth&limit=3" -H "apikey: $KEY"
```

## Dropping a policy uses its *current* name

`drop policy` on a name that no longer exists is a silent no-op, and permissive
policies are OR'd — so a stale name leaves the old grant fully active while the
migration appears to succeed. Check the most recent addendum that touched the
policy, not `schema.sql`. This is what went wrong in `addendum_012`, fixed in
`013`.

## Migrations that revoke need two phases

A `revoke` takes effect immediately and breaks whatever is currently deployed.
Split it: an additive migration to run *before* the deploy, and the revoking one
to run *after*. `addendum_017` / `addendum_018` are the worked example.
