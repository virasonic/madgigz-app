-- Backlog #60: fans following artists.
--
-- Run this in the Supabase SQL editor.

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  artist_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, artist_id),
  -- Following yourself would inflate your own count and read as a bug on the
  -- profile. Enforced here rather than only in the UI.
  constraint follows_no_self check (follower_id <> artist_id)
);

create index if not exists follows_artist_id_idx on public.follows (artist_id);

alter table public.follows enable row level security;

-- Deliberately NOT "viewable by everyone". A follow row names two people, so a
-- public select policy would publish the whole social graph - who follows whom,
-- and when. The count is public; the list is not. Anyone can see their own
-- follows, which is all the app needs to answer "am I following this artist?".
create policy "Users can see their own follows" on public.follows
  for select using (auth.uid() = follower_id);

create policy "Users can follow" on public.follows
  for insert with check (auth.uid() = follower_id);

create policy "Users can unfollow" on public.follows
  for delete using (auth.uid() = follower_id);

-- The public number lives on the profile as a stored counter rather than being
-- counted on read. Explore renders a list of artists and would otherwise need
-- one aggregate per artist, and an aggregate over `follows` cannot work under
-- the row policy above anyway - a fan counting rows would only ever count their
-- own. A counter sidesteps both.
alter table public.profiles
  add column if not exists follower_count integer not null default 0;

-- Column-level grants mean new columns are NOT granted automatically (see
-- addendum_018, and the note in CLAUDE.md). Without this the count reads as
-- missing rather than erroring, which is the confusing failure.
grant select (follower_count) on public.profiles to anon, authenticated;

create or replace function public.sync_follower_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles
      set follower_count = follower_count + 1
      where id = new.artist_id;
  elsif tg_op = 'DELETE' then
    -- greatest(...) so a counter that has drifted below zero can't go negative
    -- and start rendering "-1 followers".
    update public.profiles
      set follower_count = greatest(follower_count - 1, 0)
      where id = old.artist_id;
  end if;
  return null;
end;
$$;

drop trigger if exists follows_sync_count on public.follows;
create trigger follows_sync_count
  after insert or delete on public.follows
  for each row execute function public.sync_follower_count();

-- Backfill, so a re-run on a database that already has follows lands correctly
-- rather than leaving the counter stuck at whatever it was.
update public.profiles p
  set follower_count = coalesce(f.n, 0)
  from (select artist_id, count(*) as n from public.follows group by artist_id) f
  where p.id = f.artist_id;

comment on column public.profiles.follower_count is
  'Maintained by the follows_sync_count trigger. The follows table itself is owner-read-only, so this is the only public view of the number.';
