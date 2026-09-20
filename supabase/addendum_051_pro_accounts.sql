-- Backlog #88: pro accounts — promoters and venues, with their own web panel.
--
-- THE OWNERSHIP DECISION (the one #88 was waiting on).
--
-- `events.artist_id` means "the artist who owns and runs this show", and every
-- RLS policy keyed on `artist_id = auth.uid()` widens with it. Rather than
-- generalise that column into an owner_id/owner_type pair — which would touch
-- events, event_artists, content_posts and the whole checkout path at once —
-- a show gains a SECOND, independent owner column: `pro_account_id`.
--
--   artist_id       the performer who runs their own night (unchanged)
--   pro_account_id  the promoter/venue business that booked and sells it
--   both null       a MadGigz house show from /admin (unchanged)
--
-- The two are not alternatives to each other: a promoter's show can perfectly
-- well have a platform artist attached through `event_artists` (which is what
-- puts it on their profile and lets them post about it), exactly as an
-- admin-created show does today. What `pro_account_id` decides is who manages
-- the show and who gets paid — nothing about who is performing.
--
-- Nothing here widens RLS. The pro panel is server-rendered and reads through
-- the service-role client, exactly like /admin: the gate is `requirePro()` in
-- app code, not a row policy. So the existing artist policies keep meaning
-- precisely what they meant before, and a promoter gets no new reach through
-- the anon key.
--
-- WHY A TABLE AND NOT A `user_role` VALUE. Adding 'promoter' to the enum would
-- make every `role = 'fan'` assumption in the app wrong at once, and roles are
-- what gate the artist toolset. Pro-ness is orthogonal: a pro user is still an
-- ordinary account in the app (they browse, they hold tickets), with a panel
-- attached. Keying the table on the profile id also means the Stripe Connect
-- columns already on `profiles` serve a promoter with no new plumbing.
--
-- SAFE TO RUN ON A LIVE DB — purely additive. The app code that ships before it
-- degrades gracefully: the pro lookups catch 42P01/42703 and report "no pro
-- account", so the panel is simply unreachable until this runs.
--
-- Run in the Supabase SQL editor: STAGING first, verify, then PROD.

-- ============================ 1. The account ============================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'pro_account_type') then
    create type pro_account_type as enum ('promoter', 'venue');
  end if;
end $$;

create table if not exists public.pro_accounts (
  -- Not its own id: a pro account IS a profile, which is what lets it reuse
  -- profiles.stripe_account_id for payouts and lets the same login reach both
  -- the app and the panel.
  id uuid primary key references public.profiles(id) on delete cascade,
  type pro_account_type not null,
  -- The business name, shown in the panel header and on the admin list. Kept
  -- here rather than on profiles.artist_name: a promoter is not an artist, and
  -- overloading that column would put them in artist search results.
  display_name text not null,
  -- Venue accounts only: the room they manage. A venue sees every show at this
  -- venue_id (their calendar), but takings only on the ones they booked
  -- themselves — see fetchProEvents.
  venue_id uuid references public.venues(id) on delete set null,
  -- Off-boarding without deleting the account or the shows it owns.
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  -- A venue account with no room to manage would see nothing at all, which is
  -- a broken account rather than an empty one. Promoters have no venue.
  constraint pro_accounts_venue_has_venue check (type <> 'venue' or venue_id is not null)
);

create index if not exists pro_accounts_venue_id_idx on public.pro_accounts (venue_id);

comment on table public.pro_accounts is
  'Promoter and venue business accounts (#88). Keyed on the profile id, so the same login works in the app and in /pro. Read only through the service-role client plus the self-select policy below.';

-- ====================== 2. Who owns which show ======================

alter table public.events
  add column if not exists pro_account_id uuid references public.pro_accounts(id) on delete set null;

-- "Every show this pro account owns" is the panel's main query, run on every
-- page of it; the events table has no index that helps it.
create index if not exists events_pro_account_id_idx
  on public.events (pro_account_id);

comment on column public.events.pro_account_id is
  'The promoter/venue business that manages and is paid for this show (#88). Independent of artist_id, which stays "the performer who runs their own night".';

-- ============================ 3. Locking it down ============================

alter table public.pro_accounts enable row level security;

-- Belt and braces over RLS. Supabase grants anon/authenticated on public tables
-- by default, and this table should be reachable from the browser for exactly
-- one purpose: a pro user asking "am I one?", so the app shell can show the
-- panel link. Everything else — the whole panel — goes through service_role,
-- which these revokes do not touch.
revoke all on public.pro_accounts from anon, authenticated;
grant select (id, type, display_name, venue_id, active) on public.pro_accounts to authenticated;

-- Deliberately NOT granted: created_by and created_at (who set the account up
-- and when is admin bookkeeping, not the account holder's business).

drop policy if exists "Pro users can read their own account" on public.pro_accounts;
create policy "Pro users can read their own account" on public.pro_accounts
  for select using (id = auth.uid());

-- No insert/update/delete policy at all, on purpose: pro accounts are created
-- and deactivated from /admin through the service-role client. A promoter
-- cannot make themselves a promoter, nor rename their own business, nor
-- reassign their venue.

-- ====================== 4. Backfill / sanity ======================

-- Nothing to backfill: every existing show keeps pro_account_id null and so
-- stays exactly what it was — artist-run if it has an artist_id, a MadGigz
-- house show otherwise.
