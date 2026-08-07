-- MadGigz Stage 5 schema: run this once in the Supabase SQL Editor
-- (Project -> SQL Editor -> New query -> paste this whole file -> Run)

create extension if not exists "pgcrypto";

create type user_role as enum ('fan', 'artist', 'admin');
create type ticketing_mode as enum ('internal', 'external');
create type media_type as enum ('image', 'video');
create type discount_type as enum ('percent', 'fixed');

-- ============ TABLES ============

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  role user_role not null default 'fan',
  date_of_birth date,
  artist_name text,
  instagram text,
  tiktok text,
  twitter text,
  spotify text,
  youtube text,
  created_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid references public.profiles(id) on delete set null,
  title text not null,
  artist_name text not null,
  venue text not null,
  city text not null default 'Madrid',
  event_date date not null,
  event_time text not null,
  price numeric(10,2) not null default 0,
  currency text not null default 'EUR',
  accent_color text not null default '#d76616',
  category text not null default 'Live Music',
  image_url text,
  capacity integer not null default 100,
  sold integer not null default 0,
  description text not null default '',
  lineup text[] not null default '{}',
  doors text,
  age_restriction text not null default 'All ages',
  rating numeric(2,1) not null default 0,
  ticketing_mode ticketing_mode not null default 'internal',
  ticketing_url text,
  created_at timestamptz not null default now()
);

create table public.content_posts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  artist_id uuid references public.profiles(id) on delete set null,
  artist_name text not null,
  show_title text not null,
  caption text not null default '',
  media_url text not null,
  media_type media_type not null default 'image',
  created_at timestamptz not null default now()
);

create table public.discounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  type discount_type not null,
  value numeric(10,2) not null,
  event_id uuid references public.events(id) on delete cascade,
  max_uses integer,
  used_count integer not null default 0,
  expires_at timestamptz,
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  quantity integer not null default 1,
  price_paid numeric(10,2) not null default 0,
  discount_id uuid references public.discounts(id) on delete set null,
  purchased_at timestamptz not null default now(),
  checked_in_at timestamptz
);

create table public.saved_events (
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

-- ============ AUTO-CREATE PROFILE ON SIGNUP ============

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, role, date_of_birth)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'fan'),
    nullif(new.raw_user_meta_data->>'date_of_birth', '')::date
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ KEEP events.sold IN SYNC WITH REAL TICKET PURCHASES ============
-- A live aggregate (e.g. a view summing tickets per event) would need to read
-- other users' ticket rows, which RLS blocks for a browsing fan - so "sold" is
-- a denormalized counter kept correct by this trigger instead.

create or replace function public.handle_new_ticket()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.events set sold = sold + new.quantity where id = new.event_id;
  return new;
end;
$$;

create trigger on_ticket_created
  after insert on public.tickets
  for each row execute function public.handle_new_ticket();

-- ============ ROW LEVEL SECURITY ============

alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.content_posts enable row level security;
alter table public.tickets enable row level security;
alter table public.saved_events enable row level security;
alter table public.discounts enable row level security;

create policy "Profiles are viewable by everyone" on public.profiles
  for select using (true);
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

create policy "Events are viewable by everyone" on public.events
  for select using (true);
create policy "Artists can insert their own events" on public.events
  for insert with check (auth.uid() = artist_id);
create policy "Artists can update their own events" on public.events
  for update using (auth.uid() = artist_id);
create policy "Artists can delete their own events" on public.events
  for delete using (auth.uid() = artist_id);

create policy "Content is viewable by everyone" on public.content_posts
  for select using (true);
create policy "Artists can insert their own content" on public.content_posts
  for insert with check (auth.uid() = artist_id);
create policy "Artists can delete their own content" on public.content_posts
  for delete using (auth.uid() = artist_id);

create policy "Users can view their own tickets" on public.tickets
  for select using (auth.uid() = user_id);
create policy "Artists can view tickets for their own events" on public.tickets
  for select using (
    exists (select 1 from public.events
            where events.id = tickets.event_id and events.artist_id = auth.uid())
  );
create policy "Users can buy their own tickets" on public.tickets
  for insert with check (auth.uid() = user_id);
create policy "Artists can check in tickets for their own events" on public.tickets
  for update using (
    exists (select 1 from public.events
            where events.id = tickets.event_id and events.artist_id = auth.uid())
  );

create policy "Users can view their own saved events" on public.saved_events
  for select using (auth.uid() = user_id);
create policy "Users can save events" on public.saved_events
  for insert with check (auth.uid() = user_id);
create policy "Users can unsave events" on public.saved_events
  for delete using (auth.uid() = user_id);

create policy "Active discounts are viewable by everyone" on public.discounts
  for select using (active = true);

-- ============ STORAGE ============

insert into storage.buckets (id, name, public)
values ('event-media', 'event-media', true)
on conflict (id) do nothing;

create policy "Event media is publicly accessible" on storage.objects
  for select using (bucket_id = 'event-media');
create policy "Authenticated users can upload event media" on storage.objects
  for insert with check (bucket_id = 'event-media' and auth.role() = 'authenticated');

-- ============ SEED: the original 8 Madrid mock events ============
-- artist_id is null (no owning artist account) so these are permanent, fan-buyable
-- events regardless of which artist accounts get created later.

insert into public.events
  (title, artist_name, venue, city, event_date, event_time, price, accent_color, category,
   image_url, capacity, description, lineup, doors, age_restriction, rating)
values
  ('Noche de Fuego', 'Los Cardenales', 'Sala But', 'Madrid', '2026-08-14', '22:00', 18, '#d76616', 'Rock',
   'https://picsum.photos/seed/noche-de-fuego/800/1200', 400,
   'Los Cardenales bring their high-energy blend of flamenco rock back to Sala But for one night only, celebrating the release of their new EP.',
   array['Los Cardenales', 'Turia', 'DJ Espectro'], '21:00', '18+', 4.8),

  ('Riviera Electrónica', 'Nuria Vox', 'La Riviera', 'Madrid', '2026-08-16', '23:00', 25, '#54c3bd', 'Electronic',
   'https://picsum.photos/seed/riviera-electronica/800/1200', 2000,
   'Nuria Vox headlines a night of deep house and techno on La Riviera''s riverside terrace, with support from Madrid''s up-and-coming DJ collective.',
   array['Nuria Vox', 'Colectivo Sur', 'Mateo Rein'], '22:00', '18+', 4.6),

  ('Indie Nights', 'Las Ventanas', 'Sala El Sol', 'Madrid', '2026-08-12', '21:30', 12, '#0d5c6d', 'Indie',
   'https://picsum.photos/seed/indie-nights-elsol/800/1200', 200,
   'A cozy night of dreamy guitars and analog synths in one of Madrid''s oldest independent venues. Las Ventanas play their first Madrid show of the year.',
   array['Las Ventanas', 'Julieta Marfil'], '21:00', '16+', 4.4),

  ('Arena Rock Fest', 'Hierro Norte', 'WiZink Center', 'Madrid', '2026-08-22', '20:30', 45, '#73241d', 'Rock',
   'https://picsum.photos/seed/wizink-arena-rock/800/1200', 8000,
   'Hierro Norte''s biggest headline show yet, with a full pyrotechnic stage production and support from three of Spain''s heaviest touring acts.',
   array['Hierro Norte', 'Cenizas', 'Lobo Rojo', 'Muralla'], '19:30', 'All ages', 4.9),

  ('Jazz de Madrugada', 'Trio Copérnico', 'Copérnico', 'Madrid', '2026-08-11', '22:30', 15, '#d76616', 'Jazz',
   'https://picsum.photos/seed/copernico-jazz/800/1200', 120,
   'Late-night jazz in an intimate basement setting. Trio Copérnico plays original compositions alongside reworked Spanish standards.',
   array['Trio Copérnico'], '22:00', '18+', 4.7),

  ('Caracol Cypher', 'MC Deriva', 'Sala Caracol', 'Madrid', '2026-08-19', '22:00', 14, '#54c3bd', 'Hip-Hop',
   'https://picsum.photos/seed/caracol-hiphop/800/1200', 350,
   'Madrid''s underground hip-hop scene takes over Sala Caracol for a night of live cyphers, scratch sets, and guest verses.',
   array['MC Deriva', 'Bloque 7', 'DJ Rasca'], '21:30', '18+', 4.5),

  ('Pop en la Nazca', 'Aire Nuevo', 'Nazca Club', 'Madrid', '2026-08-25', '21:00', 20, '#0d5c6d', 'Pop',
   'https://picsum.photos/seed/nazca-pop/800/1200', 600,
   'Aire Nuevo''s synth-pop tour hits Nazca Club with a full light show and their biggest Madrid crowd yet.',
   array['Aire Nuevo', 'Marina Cielo'], '20:30', '16+', 4.6),

  ('Acústico en El Sol', 'Pablo Aguas', 'Sala El Sol', 'Madrid', '2026-08-09', '20:00', 10, '#73241d', 'Singer-Songwriter',
   'https://picsum.photos/seed/sol-acoustic/800/1200', 200,
   'A stripped-back acoustic set from Pablo Aguas, just voice and guitar, ahead of his full-band tour next month.',
   array['Pablo Aguas'], '19:30', 'All ages', 4.3);
