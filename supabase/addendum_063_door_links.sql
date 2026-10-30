-- #218: door-staff scan links.
--
-- A per-show bearer token that lets someone with no account and no app open
-- /door/<token> and scan tickets for that ONE show. The organiser mints it from
-- the show (artist profile sheet, /pro, /admin), WhatsApps it to the door
-- person, and can revoke it; it dies on its own the day after the show.
--
-- The token itself is never stored - only its sha256 - so a read of this table
-- cannot be turned into a working link. Lookups and check-ins made through a
-- link run in server actions with the service-role client, scoped to
-- door_links.event_id; the browser never talks to the database directly.
--
-- GRANTS: none, on purpose. This is the "service-role-only" kind of table (see
-- CLAUDE.md): a token hash is a credential, and the organiser-facing list of
-- links is read through a server action that re-checks ownership. RLS is
-- enabled with no policies as the second lock - Supabase's default privileges
-- would otherwise grant anon/authenticated full access to a new public table.
--
-- Safe to run before the code deploy: nothing reads it until #218 ships, and
-- the code degrades (hides the feature) while it is missing.

create table if not exists public.door_links (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  token_hash text not null unique,
  label text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  scan_count integer not null default 0
);

create index if not exists door_links_event_idx on public.door_links (event_id);

alter table public.door_links enable row level security;
revoke all on public.door_links from anon, authenticated;

comment on table public.door_links is
  'Per-show door-staff scan links (#218). Service-role only: token stored hashed, verified in server actions, scoped to event_id.';
