-- #228: log each poster-wall export (the one-tap, story-sized image of a fan's
-- attended-shows wall) so the analyst can count how often the feature is used
-- and how big the walls being shared are.
--
-- One row per export: who (user_id), when (created_at), how many posters were
-- on the wall (show_count). Nothing else - no image, no event list.
--
-- Classification: WRITE-ONLY for the user, read by service_role only.
--   * A fan can INSERT their own row (RLS: user_id = auth.uid()), and only the
--     two columns they supply - id and created_at come from the defaults.
--   * Nobody can SELECT, UPDATE or DELETE through the anon/authenticated keys.
--     The only reader is /admin/exports (service_role), which emits user_id as
--     a keyed one-way pseudonym, never the raw id.
--   * on delete cascade from profiles: an account purge takes its rows with it.
--
-- Supabase's default privileges grant anon/authenticated ALL on a new public
-- table, so revoke first and grant back exactly the insert that is needed.
--
-- Safe to run before or after the code deploy: the write is a soft-fail
-- server action (ok:false on 42P01), and the export answers 503 with this
-- file's name until the table exists.

create table if not exists public.poster_wall_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  show_count integer not null check (show_count >= 0),
  created_at timestamptz not null default now()
);

create index if not exists poster_wall_exports_created_at_idx
  on public.poster_wall_exports (created_at);

alter table public.poster_wall_exports enable row level security;

revoke all on public.poster_wall_exports from anon, authenticated;
grant insert (user_id, show_count) on public.poster_wall_exports to authenticated;

drop policy if exists "Users can log their own poster wall export" on public.poster_wall_exports;
create policy "Users can log their own poster wall export" on public.poster_wall_exports
  for insert to authenticated
  with check (auth.uid() = user_id);

comment on table public.poster_wall_exports is
  'One row per poster-wall image export (#228). Insert-only for the owner; read by service_role for the pseudonymous analyst CSV.';
