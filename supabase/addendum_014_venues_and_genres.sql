-- Venues and genres become real data instead of free text on events.
--
-- Today events.venue is a plain string: the same room can be spelled several
-- ways, has no address, and can't be reported on. events.category is the same
-- problem for genre - "Rock" and "rock" are already both in the data.
--
-- Run this in the Supabase SQL editor.

-- ============ VENUES ============

create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  -- City is stored per venue from the start even though everything is Madrid
  -- today. Opening a second city later is then a filter change, not a
  -- migration.
  city text not null default 'Madrid',
  postal_code text,
  capacity integer,
  -- For putting an address on a ticket and linking out to maps later.
  latitude numeric(9,6),
  longitude numeric(9,6),
  -- Artists can add a venue that isn't listed yet (the "Other" path). Those
  -- arrive with no address and unverified, for an admin to complete.
  verified boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Stops "Sala But" and "sala but" both existing. Scoped by city because the
-- same venue name in two cities is a different room.
create unique index if not exists venues_name_city_key
  on public.venues (lower(name), lower(city));

alter table public.events
  add column if not exists venue_id uuid references public.venues(id) on delete set null;

-- Fold every distinct venue string already on events into a real row. All
-- arrive unverified with no address: the admin adds addresses and verifies,
-- which is exactly the cleanup pass this is meant to enable. Capacity is left
-- null on purpose - an event's ticket allocation is not the room's capacity.
insert into public.venues (name, city, verified)
select distinct on (lower(e.venue), lower(coalesce(e.city, 'Madrid')))
       e.venue, coalesce(e.city, 'Madrid'), false
from public.events e
where e.venue is not null and btrim(e.venue) <> ''
on conflict do nothing;

update public.events e
set venue_id = v.id
from public.venues v
where lower(v.name) = lower(e.venue)
  and lower(v.city) = lower(coalesce(e.city, 'Madrid'))
  and e.venue_id is null;

-- ============ GENRES ============

create table if not exists public.genres (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order integer not null default 100
);

create unique index if not exists genres_name_key on public.genres (lower(name));

insert into public.genres (name, sort_order) values
  ('Rock', 10), ('Indie', 20), ('Pop', 30), ('Electronic', 40),
  ('Hip-Hop', 50), ('Jazz', 60), ('Funk & Soul', 70), ('Punk', 80),
  ('Metal', 90), ('Singer-Songwriter', 100), ('Folk', 110), ('Flamenco', 120),
  ('Latin', 130), ('Reggaeton', 140), ('Experimental', 150), ('Classical', 160)
on conflict do nothing;

-- Same join-table shape as event_artists, so a show can span genres.
create table if not exists public.event_genres (
  event_id uuid not null references public.events(id) on delete cascade,
  genre_id uuid not null references public.genres(id) on delete cascade,
  primary key (event_id, genre_id)
);

create index if not exists event_genres_genre_id_idx on public.event_genres (genre_id);

-- Map existing free-text categories onto the list, case-insensitively so the
-- "Rock"/"rock" split collapses. "Live Music" was the catch-all default and
-- carries no genre information, so it maps to nothing.
insert into public.event_genres (event_id, genre_id)
select e.id, g.id
from public.events e
join public.genres g on lower(g.name) = lower(btrim(e.category))
on conflict do nothing;

-- ============ RLS ============

alter table public.venues enable row level security;
alter table public.genres enable row level security;
alter table public.event_genres enable row level security;

create policy "Venues are viewable by everyone" on public.venues
  for select using (true);
create policy "Genres are viewable by everyone" on public.genres
  for select using (true);
create policy "Event genres are viewable by everyone" on public.event_genres
  for select using (true);

-- No client-side writes on any of these. Venue creation is deduped and marked
-- unverified by a server action, and genre selection goes through the same
-- show-actions path as artist tagging - both use the service-role client, so
-- there is deliberately no INSERT policy here.

create policy "Event owners can set genres" on public.event_genres
  for insert with check (
    exists (select 1 from public.events e where e.id = event_id and e.artist_id = auth.uid())
  );

create policy "Event owners can unset genres" on public.event_genres
  for delete using (
    exists (select 1 from public.events e where e.id = event_id and e.artist_id = auth.uid())
  );
