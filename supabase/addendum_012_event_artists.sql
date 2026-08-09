-- events.lineup is a text[] of plain names, so a lineup entry has no connection
-- to an account even when that act is on MadGigz. This adds the real link.
--
-- Deliberately a join table rather than more columns on events: venues and
-- promoters will need the same "profiles associated with an event, distinct
-- from who owns it" shape, and this is that shape.
--
-- Run this in the Supabase SQL editor.

create table if not exists public.event_artists (
  event_id uuid not null references public.events(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);

-- Looking up "which shows is this artist tagged on" is the public-profile
-- query, so it needs its own index - the primary key only helps the other way.
create index if not exists event_artists_profile_id_idx
  on public.event_artists (profile_id);

alter table public.event_artists enable row level security;

create policy "Event tags are viewable by everyone" on public.event_artists
  for select using (true);

-- Only the show's owner can tag or untag. Being tagged grants association,
-- never management - that distinction is the whole point.
create policy "Event owners can tag artists" on public.event_artists
  for insert with check (
    exists (select 1 from public.events e where e.id = event_id and e.artist_id = auth.uid())
  );

create policy "Event owners can untag artists" on public.event_artists
  for delete using (
    exists (select 1 from public.events e where e.id = event_id and e.artist_id = auth.uid())
  );

-- The existing insert policy is `with check (auth.uid() = artist_id)` and never
-- checks the event, so today any artist can attach a post to anyone's show.
-- Tagging is the point at which that has to become true rather than merely
-- unadvertised: post if you own the show, or if you were tagged on it.
drop policy if exists "Artists can insert their own content" on public.content_posts;

create policy "Artists can post on their own or tagged shows" on public.content_posts
  for insert with check (
    auth.uid() = artist_id
    and (
      exists (select 1 from public.events e where e.id = event_id and e.artist_id = auth.uid())
      or exists (
        select 1 from public.event_artists ea
        where ea.event_id = content_posts.event_id and ea.profile_id = auth.uid()
      )
    )
  );
