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

## Migrations are run by hand, and code must survive the gap

Addenda are numbered SQL files run manually in the Supabase SQL editor —
**staging project first, then prod** — not by an automated migration runner. So
code that depends on a new table/column/function ships *before* the SQL is run,
and must **degrade gracefully in the meantime**: catch the "missing" error codes
(`42P01` table, `42883` function, `42501` grant) and fall back, rather than
throwing. `addendum_033`/`034` and their callers are the pattern. When you add an
addendum, also append it to `supabase/staging_full_setup.sql` (the one-paste
fresh-DB build).

# Deploy workflow

`staging` is a locked Vercel Preview (its own Supabase + Stripe test); `main` is
prod. The loop is: **build on `staging` → verify on the staging URL → promote**.
Promote with `git merge --ff-only staging` onto `main`, then push.

`git push origin main` **must be its own isolated command** — compounded with
other commands (`&&`) it trips the auto-mode classifier and is blocked; alone it
succeeds. After promoting, fast-forward `staging` back up to `main` so they don't
drift.

`BACKLOG.md` is the source of truth for what's open/shipped; keep it current as
part of the change, not after.

# Frontend & design conventions

The app is **mobile-first**: the `(app)` shell is a centred `max-w-md` phone
column (`src/app/(app)/layout.tsx`), and until #105 every screen assumes that
width. Wide-screen layouts are the exception, added deliberately.

Colours and type come from **design tokens**, never hardcoded hex. `globals.css`
defines the brand palette (maroon/orange/cream/teal on a warm near-black) as CSS
vars exposed through Tailwind's `@theme inline` — use `bg-surface`,
`text-foreground`, `text-muted`, `bg-primary`, `text-accent`, `text-danger`,
etc. Display/heading type is **Galdern** (`font-display`, `font-heading`); body
is **DM Sans**. Reuse the primitives in `src/components/ui/` (Button, Input, …)
rather than restyling raw elements.

# i18n — every user-facing string goes through the catalog

`src/lib/i18n/en.ts` is the source of truth; `es.ts` is typed to it
(`Messages = typeof en`), so a missing/extra key fails the build. Add each new
string to **both**, read it via `useT()`'s `t("...")`, and interpolate with
`{var}` placeholders — never concatenate translated fragments. Dates render
`en-GB`, prices EUR, in both locales by design.

**The admin panel (`src/app/admin/**`) stays English** — do not wire it to the
catalog.

After changing any strings, regenerate the review artefacts so they don't drift:
`node scripts/export-i18n-json.mjs` (then
`python3 scripts/make-translation-review-pdf.py` for the review PDF).

# React / Next 16 gotchas (these break the build, not just lint)

- **Read `node_modules/next/dist/docs/` before writing Next code** (see
  AGENTS.md) — this Next has breaking changes from training-data conventions.
- **Never throw on a missing env var at module scope.** It kills the *entire*
  Vercel build, not just the one route. Default or guard instead
  (`Number(process.env.X ?? 5)`, `if (!url) return null`).
- **No `useSyncExternalStore`** — it broke the app here. Use
  `useState` + `useEffect`.
- **Don't call `setState` synchronously inside an effect body** — the Next 16
  lint (`react-hooks/set-state-in-effect`) errors on it. For a prop-driven
  reset, use React's *adjust-state-during-render* pattern: keep the last-seen
  prop in state and reset during render when it changes (see the seed handling
  in `src/lib/realtime.ts`), not an effect.
- **Realtime on RLS-scoped tables needs an authenticated socket.** The
  `@supabase/ssr` browser client doesn't push the cookie session to the
  websocket before subscribe, so `getSession()` + `realtime.setAuth(token)`
  before `.subscribe()` (again, `src/lib/realtime.ts`).

# Verify what you ship

If a change is observable in the browser, run the dev server and check it before
declaring it done — don't ask the user to verify what you can. Three adversarial
probes in `scripts/` (`security-probe.mjs`, `probe-artist-side.mjs`,
`probe-feedback.mjs`) are worth re-running after any migration touching policies
or grants; each reads the stored value back, because an UPDATE matching zero rows
returns no error and "did it error?" reports a locked door as a hole.
