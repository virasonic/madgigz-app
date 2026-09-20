-- #88, part 4: a pro account has its own language.
--
-- Vir, 20 Sept 2026: promoters and venues are third parties, not MadGigz staff,
-- so the panel should be in THEIR language — and the invite email that reaches
-- them before they have ever opened the panel has to be in it too.
--
-- WHY A COLUMN AND NOT THE LOCALE COOKIE. The app resolves language from a
-- cookie, falling back to the browser's Accept-Language (src/lib/i18n/server.ts).
-- That is right for a fan, but it cannot answer either of the two questions this
-- feature actually asks: what language do we write the invite email in, hours
-- before this person has any cookie at all; and what should the panel open in on
-- a machine MadGigz has never seen. Both are properties of the ACCOUNT, set by
-- the admin who created it, so they live on the account.
--
-- The cookie still wins for the app itself — a promoter browsing the feed is
-- just a person with a language preference. This only governs /pro and the
-- emails MadGigz sends them.
--
-- SAFE TO RUN ON A LIVE DB — additive, with a default, on a table only the
-- service-role client writes. Code shipping before it degrades to Spanish (the
-- app default) because the column reads as undefined.
--
-- REQUIRES addendum_051. Run in the Supabase SQL editor: STAGING first, PROD
-- after.

alter table public.pro_accounts
  add column if not exists locale text not null default 'es';

-- Two languages, matching src/lib/i18n/config.ts. A check rather than an enum:
-- adding a third language should be a one-line catalog change plus a one-line
-- constraint change, not a type migration with a rewrite behind it.
alter table public.pro_accounts
  drop constraint if exists pro_accounts_locale_valid;
alter table public.pro_accounts
  add constraint pro_accounts_locale_valid check (locale in ('en', 'es'));

comment on column public.pro_accounts.locale is
  'Language for the /pro panel and for MadGigz emails to this account (#88). Set when the admin creates the account, changeable by the account holder in the panel. Distinct from the app-wide locale cookie, which still governs the fan-facing app.';

-- The account holder may change their own panel language, and nothing else on
-- this row. addendum_051 deliberately gave pro_accounts no update policy at all
-- — a promoter must not be able to rename their business, reassign their venue
-- or switch themselves back on. Language is the one exception: it is a display
-- preference about themselves, with no bearing on what they can reach.
--
-- The column grant is what actually confines this. `for update ... with check`
-- restricts WHICH ROWS may be written; only the granted columns may be written
-- at all, and `locale` is the only one granted. So an UPDATE touching type,
-- display_name, venue_id or active is refused on the grant, before the policy is
-- even consulted.
grant update (locale) on public.pro_accounts to authenticated;

drop policy if exists "Pro users can set their own panel language" on public.pro_accounts;
create policy "Pro users can set their own panel language" on public.pro_accounts
  for update to authenticated
  using (id = auth.uid() and active)
  with check (id = auth.uid() and active);

-- Readable by the account holder, like the rest of their own row. Added to the
-- grant list from addendum_051 — column grants are not extended to columns added
-- later, which is the rule CLAUDE.md shouts about.
grant select (locale) on public.pro_accounts to authenticated;
