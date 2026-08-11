-- =====================================================================
-- MadGigz — full database setup for a FRESH Supabase project (staging)
-- GENERATED FILE. Do not hand-edit.
-- Rebuild: cat schema.sql + addendum_*.sql (numeric order) into this file.
-- Source of truth stays the individual files in supabase/.
-- Paste this whole file into the staging Supabase SQL Editor and Run.
-- =====================================================================

-- ############# schema.sql #############

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


-- ############# addendum_001_sold_counter.sql #############

-- Addendum: adds a sold counter to events, kept in sync via trigger.
-- Run this once in the Supabase SQL Editor.

alter table public.events add column if not exists sold integer not null default 0;

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

drop trigger if exists on_ticket_created on public.tickets;
create trigger on_ticket_created
  after insert on public.tickets
  for each row execute function public.handle_new_ticket();


-- ############# addendum_002_discount_usage.sql #############

-- Addendum: RPC function that safely increments a discount code's used_count.
-- Callable by any authenticated user (narrow, single-purpose) since a fan
-- applying a code at checkout needs to bump usage as a side effect of their
-- own purchase, but shouldn't otherwise be able to write to discounts.
-- Run this once in the Supabase SQL Editor.

create or replace function public.increment_discount_usage(discount_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.discounts set used_count = used_count + 1 where id = discount_id;
end;
$$;

grant execute on function public.increment_discount_usage(uuid) to authenticated;


-- ############# addendum_003_event_active.sql #############

-- Addendum: adds an "active" flag to events for admin moderation (hide, not
-- hard-delete, since real tickets/content can already reference an event).
-- Run this once in the Supabase SQL Editor.

alter table public.events add column if not exists active boolean not null default true;


-- ############# addendum_004_storage_delete_policy.sql #############

-- Addendum: allow uploaders to delete their own event-media Storage objects.
-- Only SELECT and INSERT policies existed on storage.objects, so an artist
-- removing a show's poster/content files silently did nothing (remove()
-- doesn't error - RLS just filters the delete down to zero matching rows).
-- Run this once in the Supabase SQL Editor.

create policy "Owners can delete their own event media" on storage.objects
  for delete using (bucket_id = 'event-media' and auth.uid() = owner);


-- ############# addendum_005_artist_verification_and_cancellation.sql #############

-- Addendum: artist verification gate + admin event cancellation with refund
-- bookkeeping. Run this once in the Supabase SQL Editor.

-- ============ ARTIST VERIFICATION ============

create type artist_status as enum ('pending', 'approved', 'rejected');

alter table public.profiles add column if not exists artist_status artist_status;
alter table public.profiles add column if not exists evidence_url text;

-- Grandfather existing artist accounts so this doesn't lock out anyone
-- already using the app - only new signups start out pending.
update public.profiles set artist_status = 'approved'
where role = 'artist' and artist_status is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, role, date_of_birth, artist_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'fan'),
    nullif(new.raw_user_meta_data->>'date_of_birth', '')::date,
    case
      when coalesce((new.raw_user_meta_data->>'role')::user_role, 'fan') = 'artist'
      then 'pending'::artist_status
      else null
    end
  );
  return new;
end;
$$;

drop policy if exists "Artists can insert their own events" on public.events;
create policy "Approved artists can insert their own events" on public.events
  for insert with check (
    auth.uid() = artist_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and artist_status = 'approved'
    )
  );

drop policy if exists "Artists can insert their own content" on public.content_posts;
create policy "Approved artists can insert their own content" on public.content_posts
  for insert with check (
    auth.uid() = artist_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and artist_status = 'approved'
    )
  );

-- ============ ADMIN EVENT CANCELLATION ============
-- No real payment processor exists yet, so "refunded" is a bookkeeping flag
-- for the admin to act on manually (bank transfer etc.), not a real
-- transaction. Cancelling an event with tickets sold soft-deletes it
-- (active=false, cancelled=true) rather than hard-deleting, so the ticket
-- rows survive as a record of who's owed a refund.

alter table public.events add column if not exists cancelled boolean not null default false;
alter table public.tickets add column if not exists refunded boolean not null default false;


-- ############# addendum_006_stripe_payments.sql #############

-- Addendum 006: real payments via Stripe Connect.
-- Run this once in the Supabase SQL Editor.
--
-- This migration does four things:
--   1. Adds Stripe linkage columns to profiles and tickets.
--   2. Moves capacity accounting to an atomic reserve/release model so
--      simultaneous checkouts can't oversell an event.
--   3. Makes fulfilment a single idempotent transaction (ticket + discount
--      usage together), safe against Stripe's webhook retries.
--   4. Closes holes that become money bugs once real payments exist:
--      client-set prices, deletable paid events, client-burnable promo codes.

-- ============ STRIPE LINKAGE ============

alter table public.profiles add column if not exists stripe_account_id text;
alter table public.profiles add column if not exists stripe_payouts_ready boolean not null default false;

alter table public.tickets add column if not exists stripe_session_id text;
alter table public.tickets add column if not exists stripe_payment_intent_id text;
alter table public.tickets add column if not exists application_fee_cents integer not null default 0;
-- Snapshot of the artist's connected account at purchase time. events.artist_id
-- is "on delete set null", so without this a deleted artist would orphan the
-- payout/refund linkage for money already taken.
alter table public.tickets add column if not exists stripe_account_id text;

-- Idempotency anchor for webhook retries: a replayed checkout.session.completed
-- must not create a second ticket.
create unique index if not exists tickets_stripe_session_id_key
  on public.tickets (stripe_session_id)
  where stripe_session_id is not null;

-- ============ CAPACITY: ATOMIC RESERVE / RELEASE ============
-- events.sold now means "reserved or sold". It is claimed when a checkout
-- session is created and released if that session expires or fails, so two
-- fans racing for the last seat can't both win.
--
-- The old INSERT trigger is dropped: capacity is now owned by these functions
-- alone, otherwise fulfilment would double-count what checkout already reserved.

drop trigger if exists on_ticket_created on public.tickets;
drop function if exists public.handle_new_ticket();

create or replace function public.reserve_event_capacity(p_event_id uuid, p_quantity integer)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.events
     set sold = sold + p_quantity
   where id = p_event_id
     and active = true
     and cancelled = false
     and sold + p_quantity <= capacity
  returning id into v_id;

  return v_id is not null;
end;
$$;

create or replace function public.release_event_capacity(p_event_id uuid, p_quantity integer)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.events
     set sold = greatest(sold - p_quantity, 0)
   where id = p_event_id;
end;
$$;

-- ============ FULFILMENT: ONE IDEMPOTENT TRANSACTION ============
-- Creates the ticket and burns the promo code together. Returns the ticket id,
-- or null if this session was already fulfilled (a webhook retry, or the
-- success-page reconciliation racing the webhook - whichever arrives second is
-- a no-op that must still report success, since a 500 makes Stripe retry
-- forever).
--
-- Capacity is NOT touched here: checkout already reserved it.

create or replace function public.fulfil_ticket(
  p_user_id uuid,
  p_event_id uuid,
  p_quantity integer,
  p_price_paid numeric,
  p_discount_id uuid,
  p_stripe_session_id text,
  p_stripe_payment_intent_id text,
  p_application_fee_cents integer,
  p_stripe_account_id text
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_ticket_id uuid;
begin
  insert into public.tickets (
    user_id, event_id, quantity, price_paid, discount_id,
    stripe_session_id, stripe_payment_intent_id, application_fee_cents, stripe_account_id
  )
  values (
    p_user_id, p_event_id, p_quantity, p_price_paid, p_discount_id,
    p_stripe_session_id, p_stripe_payment_intent_id, p_application_fee_cents, p_stripe_account_id
  )
  -- The unique index is partial, so the predicate has to be repeated here for
  -- Postgres to infer it.
  on conflict (stripe_session_id) where stripe_session_id is not null do nothing
  returning id into v_ticket_id;

  -- Only burn a promo use when a ticket was actually created, and enforce
  -- max_uses in the same statement rather than read-then-write, so concurrent
  -- redemptions can't blow past the cap.
  if v_ticket_id is not null and p_discount_id is not null then
    update public.discounts
       set used_count = used_count + 1
     where id = p_discount_id
       and (max_uses is null or used_count < max_uses);
  end if;

  return v_ticket_id;
end;
$$;

-- ============ HARDENING ============

-- These three run as their definer and bypass RLS, and Postgres grants EXECUTE
-- to public by default - without this a signed-in fan could call fulfil_ticket
-- directly with any price_paid they liked, which is exactly the hole this
-- migration exists to close. They are callable only by the service role.
revoke all on function public.reserve_event_capacity(uuid, integer) from public, anon, authenticated;
revoke all on function public.release_event_capacity(uuid, integer) from public, anon, authenticated;
revoke all on function public.fulfil_ticket(uuid, uuid, integer, numeric, uuid, text, text, integer, text)
  from public, anon, authenticated;

-- Tickets are now created only by the server (checkout action / webhook) via
-- the service role. A fan inserting directly could set any price_paid.
drop policy if exists "Users can buy their own tickets" on public.tickets;

-- Promo usage is burned inside fulfil_ticket now (atomically, and capped by
-- max_uses in the same statement). The old client-callable RPC is dead code and
-- would let any signed-in fan burn arbitrary codes, so it's dropped outright
-- rather than revoked - Postgres grants EXECUTE to PUBLIC by default, so
-- revoking from `authenticated` alone would leave it reachable.
drop function if exists public.increment_discount_usage(uuid);

-- An artist must not be able to destroy the record of money already taken.
-- The UI already guarded this; the policy did not, and the FK cascaded.
drop policy if exists "Artists can delete their own events" on public.events;
create policy "Artists can delete their own events without tickets" on public.events
  for delete using (
    auth.uid() = artist_id
    and not exists (select 1 from public.tickets where tickets.event_id = events.id)
  );

alter table public.tickets drop constraint if exists tickets_event_id_fkey;
alter table public.tickets add constraint tickets_event_id_fkey
  foreign key (event_id) references public.events(id) on delete restrict;


-- ############# addendum_007_fees_and_order_limits.sql #############

-- Addendum 007: per-event order limits + VAT-aware fee accounting.
-- Run this once in the Supabase SQL Editor.

-- Organisers cap how many tickets one fan can take in a single order, so a
-- hoarder can't clear a small room. Default 6 matches the previous hardcoded
-- limit, so existing events behave exactly as before.
alter table public.events
  add column if not exists max_per_order integer not null default 6;

alter table public.events
  drop constraint if exists events_max_per_order_check;
alter table public.events
  add constraint events_max_per_order_check check (max_per_order between 1 and 50);

-- The platform fee is now 5% + 21% VAT (min EUR0.25 before VAT). VAT is money
-- MadGigz collects on behalf of Hacienda rather than revenue, so it's stored
-- separately from the commission - otherwise the admin billing figures would
-- overstate what the business actually earned.
alter table public.tickets
  add column if not exists application_fee_vat_cents integer not null default 0;

-- fulfil_ticket gains the VAT parameter. The previous 9-argument version must
-- be dropped first: adding a 10th parameter with a default would otherwise
-- create a second overload, and Postgres rejects 9-argument calls as ambiguous
-- once both exist.
drop function if exists public.fulfil_ticket(uuid, uuid, integer, numeric, uuid, text, text, integer, text);

-- Same idempotency contract as before: returns the new ticket id, or null if
-- this session was already fulfilled.
create or replace function public.fulfil_ticket(
  p_user_id uuid,
  p_event_id uuid,
  p_quantity integer,
  p_price_paid numeric,
  p_discount_id uuid,
  p_stripe_session_id text,
  p_stripe_payment_intent_id text,
  p_application_fee_cents integer,
  p_stripe_account_id text,
  p_application_fee_vat_cents integer default 0
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_ticket_id uuid;
begin
  insert into public.tickets (
    user_id, event_id, quantity, price_paid, discount_id,
    stripe_session_id, stripe_payment_intent_id,
    application_fee_cents, application_fee_vat_cents, stripe_account_id
  )
  values (
    p_user_id, p_event_id, p_quantity, p_price_paid, p_discount_id,
    p_stripe_session_id, p_stripe_payment_intent_id,
    p_application_fee_cents, p_application_fee_vat_cents, p_stripe_account_id
  )
  on conflict (stripe_session_id) where stripe_session_id is not null do nothing
  returning id into v_ticket_id;

  if v_ticket_id is not null and p_discount_id is not null then
    update public.discounts
       set used_count = used_count + 1
     where id = p_discount_id
       and (max_uses is null or used_count < max_uses);
  end if;

  return v_ticket_id;
end;
$$;

-- Server-only, same as the original: these bypass RLS and must never be
-- callable by a signed-in fan.
revoke all on function public.fulfil_ticket(uuid, uuid, integer, numeric, uuid, text, text, integer, text, integer)
  from public, anon, authenticated;


-- ############# addendum_008_artist_bio_photo.sql #############

-- Addendum: lets artists personalize their public profile with a short bio
-- and a photo, separate from the private verification "evidence" upload.
-- Run this once in the Supabase SQL Editor.

alter table public.profiles add column if not exists artist_bio text;
alter table public.profiles add column if not exists artist_photo_url text;

-- No RLS changes needed: "Profiles are viewable by everyone" (select) and
-- "Users can update own profile" (update, auth.uid() = id) already cover
-- these two columns like every other profile field.


-- ############# addendum_009_hide_refunded_tickets.sql #############

-- Addendum: lets a fan clear a refunded ticket off their own Tickets list.
-- The ticket row itself is never deleted - it's the record of money that
-- moved, already relied on by admin billing/event-detail reporting - this
-- just adds a per-user "hide from my list" flag.
-- Run this once in the Supabase SQL Editor.

alter table public.tickets add column if not exists hidden_at timestamptz;

-- No RLS policy needed: hiding is done through a server action using the
-- admin client (which bypasses RLS), with ownership + refunded-status
-- checked in application code - see hideRefundedTicket in
-- src/app/(app)/saved/actions.ts. A client-writable RLS policy would let a
-- signed-in fan hide any column on the row via a raw PATCH, not just
-- hidden_at, which a server action avoids entirely.


-- ############# addendum_010_username_rules.sql #############

-- Usernames are shown publicly (Explore artist search renders "@username"), so
-- they need to read as handles rather than free text. Two parts: clean up what
-- already exists, then stop new ones getting in.
--
-- The rule is deliberately case-preserving. Existing accounts like "Frejar" and
-- "Kevinteo" are perfectly good handles; the problem being fixed is whitespace,
-- and lowercasing everything would rename real users for no reason.
--
-- Run this in the Supabase SQL editor.

-- 1. Strip whitespace from existing usernames. Today this affects exactly one
--    row ("Hard Fuse" -> "HardFuse"); written generally so it stays correct if
--    more slip in before this runs.
update public.profiles
set username = regexp_replace(username, '\s', '', 'g')
where username ~ '\s';

-- 2. Anything still outside the rule after step 1 would fail the constraint
--    below and abort the whole migration, so surface it rather than guessing at
--    a fix. If this raises, inspect those rows and correct them by hand first.
do $$
declare
  bad_count integer;
  bad_list text;
begin
  select count(*), string_agg(username, ', ')
  into bad_count, bad_list
  from public.profiles
  where username !~ '^[A-Za-z0-9._-]{3,30}$';

  if bad_count > 0 then
    raise exception 'Fix these usernames before adding the constraint: %', bad_list;
  end if;
end $$;

-- 3. Enforce it for real. handle_new_user() copies username straight out of
--    auth signup metadata, so validation in the signup form alone can be
--    bypassed by calling the API directly - this is what actually holds.
alter table public.profiles
  add constraint profiles_username_format
  check (username ~ '^[A-Za-z0-9._-]{3,30}$');


-- ############# addendum_011_username_uniqueness.sql #############

-- "HardFuse" and "hardfuse" are the same handle to anyone reading "@username"
-- in Explore search, so only one of them should exist. Capitals stay allowed
-- (addendum_010 is case-preserving on purpose) - this is about collisions.
--
-- Run this in the Supabase SQL editor.

-- 1. Refuse to continue if two rows would collide, rather than letting the
--    index creation fail with a less obvious error.
do $$
declare
  dupes text;
begin
  select string_agg(username, ', ')
  into dupes
  from public.profiles
  where lower(username) in (
    select lower(username) from public.profiles group by lower(username) having count(*) > 1
  );

  if dupes is not null then
    raise exception 'Resolve these colliding usernames first: %', dupes;
  end if;
end $$;

-- 2. The actual guarantee. A pre-check in the signup form can always be beaten
--    by two people submitting at the same moment; this is what makes it true.
create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));

-- 3. Lets the signup form check availability before submitting.
--
--    This exists instead of a PostgREST filter because usernames may contain
--    underscores, and "_" is a single-character wildcard in LIKE/ILIKE - a
--    check for "hard_fuse" would match "hardXfuse" and wrongly report it taken.
--    Comparing inside the function avoids pattern matching entirely.
--
--    No new information is exposed: profiles are already world-readable and
--    usernames are shown publicly in Explore search results.
create or replace function public.username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles where lower(username) = lower(trim(candidate))
  );
$$;

grant execute on function public.username_available(text) to anon, authenticated;


-- ############# addendum_012_event_artists.sql #############

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


-- ############# addendum_013_fix_content_post_policy.sql #############

-- Fixes a gap left by addendum_012.
--
-- That migration dropped "Artists can insert their own content" - the name from
-- schema.sql - but addendum_005 had already replaced it with "Approved artists
-- can insert their own content". So the drop was a no-op, the old policy
-- survived, and because permissive policies are OR'd together it kept letting
-- any approved artist post on any show. Verified: an artist neither owning nor
-- tagged on a show could still attach content to it.
--
-- This drops the policy that actually exists and folds its approved-artist
-- requirement into the ownership/tag check, so exactly one insert policy
-- remains.
--
-- Run this in the Supabase SQL editor.

drop policy if exists "Approved artists can insert their own content" on public.content_posts;
drop policy if exists "Artists can post on their own or tagged shows" on public.content_posts;

create policy "Approved artists can post on their own or tagged shows" on public.content_posts
  for insert with check (
    auth.uid() = artist_id
    -- Kept from addendum_005: posting is for approved artists only.
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and artist_status = 'approved'
    )
    and (
      exists (
        select 1 from public.events e
        where e.id = content_posts.event_id and e.artist_id = auth.uid()
      )
      or exists (
        select 1 from public.event_artists ea
        where ea.event_id = content_posts.event_id and ea.profile_id = auth.uid()
      )
    )
  );


-- ############# addendum_014_venues_and_genres.sql #############

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


-- ############# addendum_015_private_artist_evidence.sql #############

-- Artist verification evidence was being uploaded into the public event-media
-- bucket, and profiles is `select using (true)`, so profiles.evidence_url was
-- readable by anyone - logged out included. Verified: an anonymous client could
-- list every artist's evidence URL and download the file. That is fine for
-- posters; it is not fine for anything someone sends to prove who they are.
--
-- Row level security is row-level, so a single column can't be hidden from a
-- policy that returns every row. The path therefore moves to its own table, and
-- profiles keeps only a harmless boolean saying whether evidence exists.
--
-- Run this in the Supabase SQL editor.

-- 1. Private bucket. No public flag, and deliberately no SELECT policy: nothing
--    but the service role reads these, and the admin panel hands out
--    short-lived signed URLs.
insert into storage.buckets (id, name, public)
values ('artist-evidence', 'artist-evidence', false)
on conflict (id) do nothing;

drop policy if exists "Artists upload their own evidence" on storage.objects;
create policy "Artists upload their own evidence" on storage.objects
  for insert with check (
    bucket_id = 'artist-evidence'
    -- First path segment must be the uploader's own id, so one artist can't
    -- write into another's folder.
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 2. The path lives here, where the default-deny of RLS actually protects it.
create table if not exists public.artist_evidence (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  storage_path text not null,
  uploaded_at timestamptz not null default now()
);

alter table public.artist_evidence enable row level security;

create policy "Artists can record their own evidence" on public.artist_evidence
  for insert with check (profile_id = auth.uid());

-- An artist may see that their own row exists. Admins read everything through
-- the service role, which bypasses RLS - there is no policy granting anyone
-- else a read, which is the point.
create policy "Artists can see their own evidence row" on public.artist_evidence
  for select using (profile_id = auth.uid());

-- 3. A boolean is all the app needs in profiles: it drives "have they finished
--    the claim form", and leaks nothing.
alter table public.profiles
  add column if not exists evidence_submitted boolean not null default false;

update public.profiles
set evidence_submitted = true
where evidence_url is not null;

-- profiles.evidence_url is intentionally left in place for now. The files it
-- points at still have to be copied into the private bucket and the public
-- originals deleted; dropping the column first would lose the only reference to
-- them. See addendum_016.


-- ############# addendum_016_drop_public_evidence_url.sql #############

-- Follow-up to addendum_015. The three existing evidence files have been copied
-- into the private artist-evidence bucket, recorded in artist_evidence, and the
-- public originals deleted - verified by fetching the old URLs anonymously and
-- getting 400s. profiles.evidence_url is now empty and nothing reads it, so the
-- column that caused the leak can go.
--
-- Run this in the Supabase SQL editor.

-- Refuse if anything still points at a public file - that would mean a copy was
-- missed and dropping the column would lose the only reference to it.
do $$
declare
  remaining integer;
begin
  select count(*) into remaining from public.profiles where evidence_url is not null;
  if remaining > 0 then
    raise exception 'Still % profile(s) with evidence_url set - migrate those files first', remaining;
  end if;
end $$;

alter table public.profiles drop column if exists evidence_url;


-- ############# addendum_017_profile_connected_flag.sql #############

-- Step 1 of 2. Run this one NOW - it is purely additive and breaks nothing.
-- Step 2 (addendum_018) is the part that actually closes the hole, and must be
-- run only AFTER the matching app code is deployed. See the note at the bottom.
--
-- Background: profiles has "select using (true)", which is a ROW policy. It
-- grants the whole row, so date_of_birth and stripe_account_id are readable by
-- anyone holding the anon key - and the anon key ships in the browser bundle,
-- so that means anyone at all. Verified with a plain curl against /rest/v1.
--
-- The app code was never the problem: every query that reads someone else's
-- profile already selects an explicit, safe column list. The hole is the REST
-- API underneath it.

-- The artist Settings sheet shows three payout states - not connected, connected
-- but unverified, and ready - so it needs to know whether an account exists.
-- It never needs the account id itself (the only use is Boolean(...)), so
-- expose exactly the boolean and nothing more. Generated + stored, so it can
-- never drift out of sync with the column it mirrors.
alter table public.profiles
  add column if not exists stripe_account_connected boolean
  generated always as (stripe_account_id is not null) stored;

-- No grant needed here: the blanket table-level SELECT that already exists
-- covers this new column. addendum_018 replaces that blanket grant with an
-- explicit list, and includes this column in it.


-- ############# addendum_018_profile_column_grants.sql #############

-- Step 2 of 2. Run this only AFTER addendum_017 and after the app code that
-- accompanies it is deployed. Running it early breaks checkout and payout
-- onboarding, because the code shipping before it still reads
-- stripe_account_id through the user's own client.
--
-- RLS picks rows; GRANTs pick columns. The two are complementary, and this is
-- the missing half. The row policy ("Profiles are viewable by everyone") stays
-- exactly as it is - browsing an artist's public page still works. What changes
-- is that two columns are no longer part of "the row" as far as anon and
-- authenticated are concerned.
--
-- service_role keeps its own grants untouched, so the admin panel is unaffected.

revoke select on public.profiles from anon, authenticated;

-- Everything a fan, an artist, or a logged-out visitor may ever see.
-- Deliberately omitted:
--   date_of_birth     - personal data, collected for the 16+ age gate and read
--                       by nothing in the app. It should never have been public.
--   stripe_account_id - replaced for UI purposes by stripe_account_connected
--                       (addendum_017). Server code reads the real id through
--                       the service-role client instead.
grant select (
  id,
  username,
  role,
  artist_name,
  artist_bio,
  artist_photo_url,
  instagram,
  tiktok,
  twitter,
  spotify,
  youtube,
  artist_status,
  evidence_submitted,
  stripe_payouts_ready,
  stripe_account_connected,
  created_at
) on public.profiles to anon, authenticated;

-- !! Once a table has column-level grants, columns added later are NOT granted
-- automatically. Any future migration that adds a publicly-readable column to
-- profiles must add it to a grant here too, or the app will start getting 403s
-- on it. That fails closed rather than open, which is the right direction, but
-- it is easy to forget - hence this shouting comment.


-- ############# addendum_019_account_deletion.sql #############

-- Account deletion (backlog #70), self-serve and admin-initiated.
--
-- The shape is forced by the foreign keys. tickets.user_id references
-- profiles(id) ON DELETE CASCADE, and profiles.id references auth.users(id)
-- ON DELETE CASCADE - so deleting the auth user cascades all the way through
-- and takes every ticket that person ever bought with it. Those are AuraSonic's
-- sales records; Spanish commercial books have to be kept for six years, and
-- GDPR art. 17(3)(b) is explicit that a legal retention obligation outranks the
-- right to erasure.
--
-- So a deleted account is scrubbed, not removed. The profile row survives as a
-- tombstone holding nothing personal - it exists only so the tickets have
-- something to point at - and the auth user is neutered rather than deleted,
-- for the same reason.
--
-- Run this in the Supabase SQL editor.

-- Set when someone asks. The account keeps working during the grace period;
-- signing in clears this, which is the whole point of having one. Accidental
-- and regretted deletions are common, and the alternative is rebuilding
-- accounts by hand from support emails.
alter table public.profiles
  add column if not exists deletion_requested_at timestamptz;

-- Set when the purge actually runs. Non-null means "this is a tombstone" - no
-- personal data left, cannot sign in, retained only to anchor the ticket rows.
alter table public.profiles
  add column if not exists deleted_at timestamptz;

-- The purge job scans for due requests, so keep that cheap. Partial: the
-- overwhelming majority of rows have this null forever.
create index if not exists profiles_deletion_requested_at_idx
  on public.profiles (deletion_requested_at)
  where deletion_requested_at is not null;

-- Both columns are readable by the account's owner (to show "deletion pending")
-- and are not personal data, so they join the public grant list from
-- addendum_018. Remember: once a table has column-level grants, new columns
-- are NOT granted automatically - this is exactly the case that comment warned
-- about.
grant select (deletion_requested_at, deleted_at) on public.profiles to anon, authenticated;

comment on column public.profiles.deletion_requested_at is
  'When the account holder (or an admin) asked for deletion. Cleared if they sign in during the 30-day grace period.';
comment on column public.profiles.deleted_at is
  'When the purge ran. The row is a tombstone from this point: no personal data, no sign-in, kept only so tickets (6-year retention) keep a valid foreign key.';


-- ############# addendum_020_house_run_events.sql #############

-- Backlog #62: shows created by MadGigz itself from the admin panel.
--
-- Two kinds, and they need different plumbing:
--
--   External-link shows - MadGigz advertises a gig sold somewhere else
--   (Entradium and friends). ticketing_mode = 'external' already covers this
--   entirely; no money moves through us, so nothing new is needed.
--
--   House shows - MadGigz sells the tickets itself, for its own nights or a
--   band it runs directly. This is the case the payments code cannot express
--   today: checkout looks up the event's artist, demands a connected Stripe
--   account, and splits the money with an application fee. A house show has no
--   artist to pay and no commission to take - the money simply belongs to the
--   platform account.
--
-- Hence an explicit flag rather than inferring it from a null artist_id. "No
-- artist attached" and "MadGigz keeps the money" are different statements, and
-- an admin can perfectly well create an external-link show for an off-platform
-- artist without it becoming a house show.
--
-- Run this in the Supabase SQL editor.

alter table public.events
  add column if not exists house_run boolean not null default false;

comment on column public.events.house_run is
  'MadGigz sells these tickets on its own account: no Stripe Connect transfer, no application fee, and refunds do not reverse a transfer. Set only from the admin panel.';

-- Existing shows are all artist-run. The default covers them, but be explicit
-- so a re-run on a partially-migrated database still lands somewhere sane.
update public.events set house_run = false where house_run is null;


-- ############# addendum_021_follows.sql #############

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


-- ############# addendum_022_notifications.sql #############

-- Backlog #86: in-app notifications.
--
-- Rows are created by database triggers rather than by the app. The events that
-- matter here - being tagged, gaining a follower, an artist you follow
-- publishing a show - all already happen through inserts, and putting the
-- notification next to the insert means it cannot be forgotten at one of the
-- several call sites that can cause it (an artist tagging a support act, an
-- admin tagging one from the panel, and later a promoter doing the same).
--
-- Run this in the Supabase SQL editor.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  -- Text with a check rather than a pg enum: adding a type later is an ALTER
  -- on the constraint, not a migration that has to touch a type other objects
  -- depend on.
  type text not null check (
    type in ('tagged_in_event', 'new_follower', 'followed_artist_show', 'event_upcoming')
  ),
  -- Who caused it, where relevant. on delete set null so a deleted account
  -- doesn't take the notification with it.
  actor_id uuid references public.profiles(id) on delete set null,
  event_id uuid references public.events(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_idx
  on public.notifications (recipient_id, created_at desc);

-- Stops the nightly "your gig is tomorrow" sweep sending the same reminder
-- twice if it runs more than once in a day.
create unique index if not exists notifications_upcoming_once
  on public.notifications (recipient_id, event_id)
  where type = 'event_upcoming';

alter table public.notifications enable row level security;

create policy "Users read their own notifications" on public.notifications
  for select using (auth.uid() = recipient_id);

-- Marking as read is the only thing a user may change, and only on their own.
create policy "Users mark their own notifications read" on public.notifications
  for update using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);

create policy "Users delete their own notifications" on public.notifications
  for delete using (auth.uid() = recipient_id);

-- No insert policy at all. Every row comes from the security-definer triggers
-- below or from the cron sweep on the service role, so nobody can post a
-- notification into someone else's list.

create or replace function public.notify_on_tag()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (recipient_id, type, event_id, actor_id)
  select new.profile_id, 'tagged_in_event', new.event_id, e.artist_id
  from public.events e
  where e.id = new.event_id
    -- Tagging yourself on your own show isn't news.
    and (e.artist_id is null or e.artist_id <> new.profile_id);
  return null;
end;
$$;

drop trigger if exists event_artists_notify on public.event_artists;
create trigger event_artists_notify
  after insert on public.event_artists
  for each row execute function public.notify_on_tag();

create or replace function public.notify_on_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (recipient_id, type, actor_id)
  values (new.artist_id, 'new_follower', new.follower_id);
  return null;
end;
$$;

drop trigger if exists follows_notify on public.follows;
create trigger follows_notify
  after insert on public.follows
  for each row execute function public.notify_on_follow();

-- A followed artist publishing a show. Fires on insert and on an event being
-- un-hidden, since a show created hidden and revealed later is new to a fan
-- either way.
create or replace function public.notify_followers_of_show()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.artist_id is null or new.active is not true or new.cancelled then
    return null;
  end if;

  if tg_op = 'UPDATE' and old.active is true then
    return null;
  end if;

  insert into public.notifications (recipient_id, type, event_id, actor_id)
  select f.follower_id, 'followed_artist_show', new.id, new.artist_id
  from public.follows f
  where f.artist_id = new.artist_id
  -- Belt and braces: the unique index below doesn't cover this type, so guard
  -- against an update path sending a second copy.
  and not exists (
    select 1 from public.notifications n
    where n.recipient_id = f.follower_id
      and n.event_id = new.id
      and n.type = 'followed_artist_show'
  );
  return null;
end;
$$;

drop trigger if exists events_notify_followers on public.events;
create trigger events_notify_followers
  after insert or update of active on public.events
  for each row execute function public.notify_followers_of_show();


-- ############# addendum_023_ticket_sale_notifications.sql #############

-- Adds "you sold a ticket" to the notification types, so an artist hears about
-- sales without watching the Buyers tab.
--
-- One row per sale rather than a running total. The app groups them on read -
-- "12 new ticket sales for X" - which keeps the individual timestamps for the
-- cases where a handful of sales is more useful listed out than counted.
--
-- Run this in the Supabase SQL editor.

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type in (
    'tagged_in_event',
    'new_follower',
    'followed_artist_show',
    'event_upcoming',
    'ticket_sold'
  )
);

create or replace function public.notify_on_ticket_sale()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner_id uuid;
begin
  select artist_id into owner_id from public.events where id = new.event_id;

  -- No owner means a MadGigz house show: the sale is the platform's, and the
  -- admin panel already reports it. Nobody to tell here.
  if owner_id is null then
    return null;
  end if;

  -- An artist buying a ticket to their own show shouldn't notify themselves.
  if owner_id = new.user_id then
    return null;
  end if;

  insert into public.notifications (recipient_id, type, event_id, actor_id)
  values (owner_id, 'ticket_sold', new.event_id, new.user_id);
  return null;
end;
$$;

drop trigger if exists tickets_notify_sale on public.tickets;
create trigger tickets_notify_sale
  after insert on public.tickets
  for each row execute function public.notify_on_ticket_sale();


-- ############# addendum_024_profile_update_grants.sql #############

-- Closes a live privilege escalation on public.profiles.
--
-- "Users can update own profile" (schema.sql) is:
--
--   for update using (auth.uid() = id)
--
-- which correctly stops you editing someone else's row, and says nothing at all
-- about WHICH COLUMNS you may edit on your own. Verified against the real API
-- on 10 Aug 2026 with a throwaway account: an ordinary signed-in fan could set
--
--   role              -> 'artist'      (skips the whole verification gate)
--   artist_status     -> 'approved'    (ditto, and then they can publish shows)
--   date_of_birth     -> '2020-01-01'  (defeats the 16+ age gate after signup)
--   stripe_payouts_ready -> true
--   stripe_account_id -> anything
--
-- This is the third instance of the same mistake in this project, and the exact
-- thing CLAUDE.md warns about: RLS picks ROWS, GRANTs pick COLUMNS. addendum_018
-- fixed the read half of this table. This is the write half.
--
-- Nothing server-side is affected: payout-actions.ts, account-actions.ts,
-- admin/actions.ts, the Stripe webhook and lib/account-deletion.ts all write
-- through the service-role client, which these grants do not touch.
--
-- Run this in the Supabase SQL editor.

revoke update on public.profiles from anon, authenticated;

-- Everything a person may legitimately change about themselves from the app.
-- These are the columns the two client-side writers actually set:
-- (onboarding)/signup/artist-profile/page.tsx and (app)/profile/edit/page.tsx.
--
-- Deliberately omitted, and why:
--   id, created_at        - identity. Never.
--   username              - a public handle; changing it is [[89]], which has
--                           rules (a 10-day cooldown) that a raw UPDATE cannot
--                           enforce. Until then it is set once, at signup.
--   role, artist_status   - the artist verification gate. Only an admin, or
--                           complete_onboarding() at signup, may set these.
--   date_of_birth         - the 16+ gate. Set once at signup and never edited,
--                           which is also why it is not readable (addendum_018).
--   stripe_account_id,
--   stripe_payouts_ready  - payout routing. Written only by payout-actions.ts
--                           and the account.updated webhook, both service-role.
--   follower_count        - maintained by the sync_follower_count() trigger.
--   deletion_requested_at,
--   deleted_at            - the deletion grace period. Server-side only, or
--                           someone could quietly un-schedule their own purge.
grant update (
  artist_name,
  artist_bio,
  artist_photo_url,
  instagram,
  tiktok,
  twitter,
  spotify,
  youtube,
  evidence_submitted
) on public.profiles to authenticated;

-- The policy had no WITH CHECK, so the USING clause was doing double duty. With
-- column grants in place that no longer matters much, but state it explicitly
-- rather than relying on the fallback.
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Same warning as addendum_018, now for the other verb: once a table has
-- column-level UPDATE grants, columns added later are NOT granted. A new
-- user-editable profile field needs adding to the list above, or saving it
-- fails with 42501.


-- ############# addendum_025_oauth_onboarding.sql #############

-- Groundwork for Google (and later Apple) sign-in.
--
-- The problem: handle_new_user() reads username, role and date_of_birth out of
-- raw_user_meta_data, which the signup form fills in. An OAuth callback carries
-- none of them - Google sends name, email and a picture. Left as it was, a
-- Google signup would have produced a profile with
--
--   username      = the email's local part, which may be >30 chars, may contain
--                   '+' and may already be taken - any of which violates
--                   addendum_010's format check or addendum_011's unique index
--                   and fails the whole signup with "Database error saving new
--                   user"
--   date_of_birth = null, silently skipping the 16+ age gate
--   role          = 'fan', with no way for an artist to say otherwise
--
-- So: the trigger learns to cope with missing metadata by parking the account
-- in an incomplete state, and a post-callback screen collects the three real
-- answers through complete_onboarding() below.
--
-- Run this in the Supabase SQL editor, AFTER addendum_024.

-- ============ 1. The incomplete flag ============

-- Defaults to true so every existing account is untouched. Only the trigger
-- below ever sets it false, and only when the metadata isn't there.
alter table public.profiles
  add column if not exists onboarding_complete boolean not null default true;

-- Column-level grants mean new columns are NOT granted automatically
-- (addendum_018). Read-only, and only for signed-in users - a logged-out
-- visitor browsing an artist page has no business knowing this.
grant select (onboarding_complete) on public.profiles to authenticated;

-- ============ 2. A trigger that survives missing metadata ============

-- Picks a username that is guaranteed to satisfy addendum_010's format check
-- and addendum_011's unique index, so an OAuth signup can never fail on it.
-- This is a placeholder: the completion screen immediately asks the person what
-- they actually want to be called, and complete_onboarding() overwrites it.
create or replace function public.placeholder_username(email text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  base text;
  candidate text;
  attempts int := 0;
begin
  -- Strip anything the format check would reject, including the '+' in
  -- "someone+tag@gmail.com", and leave room for a numeric suffix.
  base := left(regexp_replace(split_part(coalesce(email, ''), '@', 1), '[^A-Za-z0-9._-]', '', 'g'), 20);
  if length(base) < 3 then
    base := 'gigzfan';
  end if;

  candidate := base;
  while exists (select 1 from public.profiles where lower(username) = lower(candidate)) loop
    attempts := attempts + 1;
    -- After a few collisions stop guessing politely and take a uuid slice; the
    -- loop must terminate even if someone has claimed every base+NNNN.
    if attempts > 20 then
      return left('gigz' || replace(gen_random_uuid()::text, '-', ''), 30);
    end if;
    candidate := base || floor(random() * 10000)::int::text;
  end loop;

  return candidate;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  meta_username text := new.raw_user_meta_data->>'username';
  meta_role text := new.raw_user_meta_data->>'role';
  meta_dob date := nullif(new.raw_user_meta_data->>'date_of_birth', '')::date;
  -- The email/password form always sends a username. An OAuth provider never
  -- does, and that absence is the only reliable signal we have here.
  is_oauth boolean := meta_username is null;
  final_role user_role := coalesce(meta_role::user_role, 'fan');
begin
  insert into public.profiles (
    id, username, role, date_of_birth, artist_status, onboarding_complete
  )
  values (
    new.id,
    coalesce(meta_username, public.placeholder_username(new.email)),
    final_role,
    meta_dob,
    case when final_role = 'artist' then 'pending'::artist_status else null end,
    not is_oauth
  );
  return new;
end;
$$;

-- ============ 3. The one place role and date_of_birth may be set ============

-- addendum_024 took role, date_of_birth and username away from the client, so
-- the completion screen cannot simply UPDATE its own row - which is the point.
-- This is the narrow, single-use door instead: it only works while the profile
-- is incomplete, and it enforces the same rules the signup form does, on the
-- server, where they cannot be skipped by talking to the API directly.
--
-- Returns a status code rather than raising, so the screen can put the message
-- under the right field instead of showing a Postgres error.
create or replace function public.complete_onboarding(
  p_username text,
  p_role text,
  p_date_of_birth date
)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  is_complete boolean;
  clean text := trim(coalesce(p_username, ''));
begin
  if uid is null then
    return 'not_signed_in';
  end if;

  select onboarding_complete into is_complete from public.profiles where id = uid;
  if is_complete is null then
    return 'no_profile';
  end if;
  -- Single use. Without this the RPC would be a permanent bypass of every rule
  -- addendum_024 just imposed - change your role to artist whenever you like.
  if is_complete then
    return 'already_complete';
  end if;

  if p_role not in ('fan', 'artist') then
    return 'bad_role';
  end if;
  -- Same pattern as addendum_010 and the signup form.
  if clean !~ '^[A-Za-z0-9._-]{3,30}$' then
    return 'username_invalid';
  end if;
  if p_date_of_birth is null then
    return 'dob_required';
  end if;
  -- The 16+ gate, enforced somewhere it actually holds. Until now it lived only
  -- in the signup form's JavaScript.
  if p_date_of_birth > (current_date - interval '16 years')::date then
    return 'too_young';
  end if;
  if exists (
    select 1 from public.profiles where lower(username) = lower(clean) and id <> uid
  ) then
    return 'username_taken';
  end if;

  update public.profiles set
    username = clean,
    role = p_role::user_role,
    date_of_birth = p_date_of_birth,
    -- An artist arriving through Google is as unverified as one arriving
    -- through the form: they land in the same review queue.
    artist_status = case when p_role = 'artist' then 'pending'::artist_status else null end,
    onboarding_complete = true
  where id = uid;

  return 'ok';
exception
  -- Two people can pass the check above in the same instant; addendum_011's
  -- unique index is what actually decides it.
  when unique_violation then
    return 'username_taken';
end;
$$;

revoke execute on function public.complete_onboarding(text, text, date) from public, anon;
grant execute on function public.complete_onboarding(text, text, date) to authenticated;


-- ############# addendum_026_ticket_and_event_column_grants.sql #############

-- The same mistake as addendum_024, now on tickets and events: a row policy
-- decides WHICH ROWS you may write, and nothing decides WHICH COLUMNS.
--
-- Found by scripts/security-probe.mjs on 10 Aug 2026, running as ordinary
-- signed-in users against the live database. Fans came out clean - there is no
-- fan UPDATE policy on tickets at all, so a ticket holder cannot touch their own
-- ticket. The holes are on the artist side, where a policy does exist:
--
--   "Artists can check in tickets for their own events"
--      for update using (<the event is mine>)
--
--   was named for checking in, and grants everything. An artist could set
--   price_paid to any number on their own show's tickets - which is the figure
--   /admin/billing sums into gross ticket volume and the MadGigz fee - or flip
--   refunded to true, making a paying fan's ticket vanish without a cent
--   moving.
--
--   "Artists can update their own events"
--      for update using (auth.uid() = artist_id)
--
--   let an artist set sold = 0 on a sold-out show. sold is not a display
--   counter: addendum_006 made it the atomic capacity reservation
--   ("update events set sold = sold + q where sold + q <= capacity"), so
--   zeroing it re-opens a full venue and oversells the room. house_run was
--   writable too, and that decides whether the money is transferred to the
--   artist or kept by the platform.
--
-- Run this in the Supabase SQL editor.

-- ============ TICKETS ============

revoke update on public.tickets from anon, authenticated;

-- Checking someone in at the door is the only thing an artist's browser has
-- ever needed to write here (profile/scan/page.tsx). Everything else - refunds,
-- hiding a refunded ticket, the Stripe ids, what was paid - goes through the
-- service-role client in admin/actions.ts, saved/actions.ts and the webhook.
--
-- The row policy still applies on top of this: an artist can only reach tickets
-- for their own events, and a fan can reach none.
grant update (checked_in_at) on public.tickets to authenticated;

-- ============ EVENTS ============

revoke update on public.events from anon, authenticated;

-- Hiding and unhiding a show is the one event edit the browser makes directly
-- (ManageShowModal's visibility toggle). Editing the details goes through
-- updateShow() in profile/show-actions.ts, which is a server action using the
-- service-role client and its own ownership check - so nothing legitimate
-- loses anything here.
grant update (active) on public.events to authenticated;

-- Inserting is still the artist's own (add-show/page.tsx), but only the fields
-- that form actually sends. Anything omitted keeps its column default, which
-- is what we want for sold (0) and house_run (false) - neither is the artist's
-- to declare at creation either.
revoke insert on public.events from anon, authenticated;
grant insert (
  artist_id,
  title,
  artist_name,
  venue,
  venue_id,
  city,
  event_date,
  event_time,
  price,
  currency,
  accent_color,
  category,
  image_url,
  capacity,
  max_per_order,
  description,
  lineup,
  doors,
  age_restriction,
  rating,
  ticketing_mode,
  ticketing_url
) on public.events to authenticated;

-- Deliberately NOT insertable or updatable by anyone's browser:
--   sold        - owned by the reservation RPC and the refund path.
--   house_run   - decides where the money goes; set in the admin panel only.
--   cancelled   - admin cancellation, which also issues the Stripe refunds.
--   created_at  - self-explanatory.

-- Same standing warning as addendum_018 and addendum_024: with column-level
-- grants in place, a column added later is NOT granted. A new artist-editable
-- event field has to be added to the grant above, or saving it fails with
-- 42501.


-- ############# addendum_027_feedback.sql #############

-- Backlog #94: a way for fans and artists to tell us something, and a place for
-- an admin to read it.
--
-- Deliberately called "feedback" and not "tickets" - the app already sells
-- those, /admin/billing already lists them, and a support queue sharing the
-- word would make every conversation about it ambiguous.
--
-- Run this in the Supabase SQL editor.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),

  -- on delete set null, not cascade: someone deleting their account should not
  -- also delete the bug report that told us the checkout was broken. The
  -- message stays, attributed to nobody. See addendum_019 - the account purge
  -- is the reason this distinction matters here.
  user_id uuid references public.profiles(id) on delete set null,

  -- Text with a check, same reasoning as notifications in addendum_022: adding
  -- a category later is an ALTER on the constraint rather than a migration that
  -- touches a type other objects depend on.
  type text not null default 'idea' check (type in ('bug', 'support', 'idea')),
  message text not null check (char_length(trim(message)) between 1 and 4000),

  -- Context captured at submission rather than asked for. Someone reporting
  -- "the button doesn't work" should not also have to say which screen they
  -- were on, and the answer they'd give a week later is worse than the one the
  -- browser already knows.
  route text,
  -- Their role WHEN THEY WROTE IT. A fan who later becomes an artist shouldn't
  -- retroactively turn an old report into an artist's report - the whole point
  -- of the field is knowing which version of the app they were looking at.
  role_at_submission text,
  -- The email is copied rather than joined, so a reply is still possible after
  -- the account is gone and user_id has been nulled.
  contact_email text,

  status text not null default 'new' check (status in ('new', 'open', 'resolved')),
  admin_note text,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- The admin queue is read newest-first and filtered by status, which is what
-- this covers. Nothing reads feedback by user, so there is no index for it.
create index if not exists feedback_status_created_idx
  on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;

-- Read your own, so a "thanks, we got it" screen is possible later. Notably
-- NOT "viewable by everyone" - a support message can contain anything, and
-- this project has been caught out twice by a permissive select policy on a
-- table holding something private.
create policy "Users read their own feedback" on public.feedback
  for select using (auth.uid() = user_id);

create policy "Users can send feedback" on public.feedback
  for insert with check (auth.uid() = user_id);

-- No update or delete policy at all. Nobody edits a submission after sending
-- it, and triage (status, admin_note, resolved_*) belongs to the admin panel,
-- which goes through the service-role client.

-- Columns, not just rows - the lesson of addendum_018, 024 and 026. Without
-- this, the insert policy above would let someone submit their own feedback
-- pre-marked 'resolved', or write an admin_note into it.
revoke insert on public.feedback from anon, authenticated;
grant insert (user_id, type, message, route, role_at_submission, contact_email)
  on public.feedback to authenticated;

revoke select on public.feedback from anon, authenticated;
grant select (id, type, message, route, status, created_at, resolved_at, user_id)
  on public.feedback to authenticated;


-- ############# addendum_028_announcements.sql #############

-- Lets MadGigz itself post to the feed.
--
-- Every content_post has so far belonged to a show: event_id is not null, and
-- the reel card renders a "Tickets available now" panel pointing at it. That is
-- exactly right for an artist promoting a gig and exactly wrong for "here is
-- how the app works", which is what a brand-new signup needs and what there has
-- been no way to say.
--
-- An announcement is simply a post with no event. No new table and no
-- is_announcement flag: the absence of a show IS the distinction, and a boolean
-- that has to agree with a nullable column is a second source of truth waiting
-- to disagree with the first.
--
-- Run this in the Supabase SQL editor.

alter table public.content_posts alter column event_id drop not null;

-- show_title is not null and means nothing without a show. Default it so an
-- announcement insert doesn't have to pass an empty string by hand.
alter table public.content_posts alter column show_title set default '';

-- Admins only. Deliberately not "approved artists": the feed is a shared space,
-- and a post with no show attached carries MadGigz's own voice rather than an
-- artist's. The existing artist policy (addendum_013) cannot be used for these
-- anyway - both of its branches look up content_posts.event_id, and with a null
-- event_id they find nothing and refuse.
create policy "Admins can post announcements" on public.content_posts
  for insert with check (
    content_posts.event_id is null
    and exists (
      select 1 from public.profiles where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admins can delete announcements" on public.content_posts
  for delete using (
    content_posts.event_id is null
    and exists (
      select 1 from public.profiles where id = auth.uid() and role = 'admin'
    )
  );

-- The feed reads content_posts with a plain select and the existing "Content is
-- viewable by everyone" policy already covers these, so nothing changes for
-- readers.


-- ############# addendum_029_text_announcements.sql #############

-- Lets an admin write an announcement in the panel and have it rendered on the
-- brand template, instead of uploading a pre-made image.
--
-- The template is a real CSS card (see AnnouncementCard), not a generated PNG:
-- it works on Vercel with no image toolchain, stays editable, and always looks
-- current if the brand changes. So a text announcement needs no media at all,
-- and it needs somewhere to keep the headline and the accent tint.
--
-- Run this in the Supabase SQL editor, after addendum_028.

-- A text card has no image or video. media_url was NOT NULL because every post
-- used to be an artist reel about a show.
alter table public.content_posts alter column media_url drop not null;

-- media_type still can't be null (it has a default), but for a text card it is
-- meaningless. Add a value for it rather than leaving it lying about being an
-- image. Requires extending the enum.
do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'media_type' and e.enumlabel = 'text'
  ) then
    alter type media_type add value 'text';
  end if;
end $$;

-- The headline (the big line) and the accent that tints the card's glow. The
-- body text reuses `caption`, which every post already has. show_title is left
-- for the generated-set marker it already carries.
alter table public.content_posts add column if not exists headline text;
alter table public.content_posts add column if not exists accent_color text;

-- content_posts is world-readable through "Content is viewable by everyone", a
-- table-level select policy rather than column grants, so new columns are
-- covered automatically here - unlike the profiles table. Nothing to grant.


-- ############# addendum_030_username_change.sql #############

-- Backlog #89 + #91: let people change their username, and sign in with it.
--
-- These are one feature. A username you can change is a public handle; a
-- username you can sign in with is a credential; and the moment it is both,
-- "what happens to the old name" has to be answered once for both. Vir decided
-- it on 9 Aug 2026: a released username is held for 10 days before anyone else
-- can claim it, so it can't be grabbed the instant an artist changes handles.
--
-- Run this in the Supabase SQL editor.

-- ============ 1. The history of released names ============

create table if not exists public.username_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  old_username text not null,
  released_at timestamptz not null default now()
);

-- The only read pattern is "is this name held, and by whom, in the last N days".
create index if not exists username_history_lookup
  on public.username_history (lower(old_username), released_at desc);

alter table public.username_history enable row level security;
-- No policies at all: only the security-definer functions below touch it, and
-- they run as the definer. Nobody queries this table directly from the app -
-- it would leak the previous handles of every account otherwise.

-- ============ 2. Availability now respects the cooldown ============

-- Replaces addendum_011's version. A name is available when nobody holds it
-- AND it wasn't released by SOMEONE ELSE within the last 10 days. "Someone
-- else" matters: you can always reclaim a handle you just released yourself.
create or replace function public.username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not exists (
      select 1 from public.profiles where lower(username) = lower(trim(candidate))
    )
    and not exists (
      select 1 from public.username_history h
      where lower(h.old_username) = lower(trim(candidate))
        and h.released_at > now() - interval '10 days'
        -- auth.uid() is null for a logged-out signup check, so coalesce to a
        -- value no real profile has: the cooldown then applies to everyone.
        and h.profile_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    );
$$;

grant execute on function public.username_available(text) to anon, authenticated;

-- ============ 3. The rename itself ============

-- Client code cannot UPDATE profiles.username directly - addendum_024 revoked
-- that. This is the single door, and it enforces every rule server-side:
-- format, the release cooldown, and recording the old name so the cooldown can
-- see it. Returns a status string so the form can put the message on the field.
create or replace function public.change_username(p_new text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  current_name text;
  clean text := trim(coalesce(p_new, ''));
begin
  if uid is null then
    return 'not_signed_in';
  end if;

  select username into current_name from public.profiles where id = uid;
  if current_name is null then
    return 'no_profile';
  end if;

  -- A pure case change ("van" -> "Van") is allowed and not a "release": the
  -- handle is the same to everyone reading it, so it skips the history record.
  if lower(clean) = lower(current_name) then
    if clean = current_name then
      return 'unchanged';
    end if;
    update public.profiles set username = clean where id = uid;
    return 'ok';
  end if;

  if clean !~ '^[A-Za-z0-9._-]{3,30}$' then
    return 'invalid';
  end if;

  if not public.username_available(clean) then
    return 'taken';
  end if;

  -- Record the name being left behind, then take the new one. The order
  -- matters: the history row is what holds the old name for 10 days.
  insert into public.username_history (profile_id, old_username)
  values (uid, current_name);

  update public.profiles set username = clean where id = uid;
  return 'ok';
exception
  -- Two people racing for the same free name; the unique index decides it.
  when unique_violation then
    return 'taken';
end;
$$;

revoke execute on function public.change_username(text) from public, anon;
grant execute on function public.change_username(text) to authenticated;

-- ============ 4. Username -> email, for sign-in ============

-- Supabase Auth only authenticates on email. This resolves a username to the
-- address so a server action can sign the person in - it is NEVER granted to
-- anon or authenticated, so the browser cannot call it to harvest emails. Only
-- the service-role client (server-side, behind the sign-in action) may.
create or replace function public.email_for_username(candidate text)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.email
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(p.username) = lower(trim(candidate))
  limit 1;
$$;

revoke execute on function public.email_for_username(text) from public, anon, authenticated;
grant execute on function public.email_for_username(text) to service_role;


-- ############# addendum_031_content_moderation.sql #############

-- Backlog #96: a way for anyone to report a feed post, a queue for an admin to
-- judge it, and a way to pull a post without destroying it.
--
-- Today a fan or artist puts a photo or video on a public feed with nothing
-- between them and it, and the only way to take one down is a developer in the
-- database. This closes that before the app is promoted.
--
-- Run this in the Supabase SQL editor.

-- ============ 1. Pulling a post, reversibly ============

-- A hidden post stays in the table - the report trail and the artist's own
-- record need it - but drops out of every public surface. Soft, so a wrongly
-- hidden post can be restored, unlike a delete.
alter table public.content_posts add column if not exists hidden_at timestamptz;

-- content_posts is world-readable via a table-level select policy, so the app
-- must filter hidden_at itself. The queries do (fetchContentPosts,
-- fetchShowContent). Nothing to grant.

-- ============ 2. The reports ============

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  content_post_id uuid not null references public.content_posts(id) on delete cascade,
  -- on delete set null, not cascade: a reporter deleting their account should
  -- not erase the report that got a post taken down. Same call as feedback.
  reporter_id uuid references public.profiles(id) on delete set null,
  reason text not null check (reason in ('spam', 'inappropriate', 'hate', 'violence', 'other')),
  detail text check (detail is null or char_length(detail) <= 1000),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  admin_note text,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- One report per person per post: a second tap is not a second complaint. Two
-- different people reporting the same post is two rows, which is the signal
-- that matters.
create unique index if not exists content_reports_one_per_reporter
  on public.content_reports (content_post_id, reporter_id);

-- The queue is read newest-first, filtered by status.
create index if not exists content_reports_status_created
  on public.content_reports (status, created_at desc);

alter table public.content_reports enable row level security;

-- Read your own, so the UI can show "reported" and not offer it twice. NOT
-- world-readable: who reported what is nobody else's business.
create policy "Users read their own reports" on public.content_reports
  for select using (auth.uid() = reporter_id);

create policy "Users can report" on public.content_reports
  for insert with check (auth.uid() = reporter_id);

-- No update or delete policy. Triage (status, admin_note, resolved_*) is
-- admin-only through the service-role client.

-- Columns, per the lesson of addendum_024/026: without this the insert policy
-- would let someone file a report pre-marked 'dismissed' or with an admin_note.
revoke insert on public.content_reports from anon, authenticated;
grant insert (content_post_id, reporter_id, reason, detail)
  on public.content_reports to authenticated;

revoke select on public.content_reports from anon, authenticated;
grant select (id, content_post_id, reason, status, created_at, reporter_id)
  on public.content_reports to authenticated;


-- ############# addendum_032_username_available_self.sql #############

-- addendum_032: username_available() must exclude the caller's own profile.
--
-- The bug: the profiles existence check in username_available() (addendum_030)
-- had no "and id <> auth.uid()", unlike complete_onboarding(). For a logged-OUT
-- signup that is correct - the person has no profile row yet. But two logged-IN
-- flows also use it:
--   * the OAuth "complete profile" form - handle_new_user() creates a
--     PLACEHOLDER profile from the user's email at Google sign-in, so when they
--     then type the username they actually want, it collided with their OWN
--     placeholder row and the form said "That username is taken". Real users
--     were forced into names like "FynnDinsdale1".
--   * the username-change form (profile/edit) had the same latent issue.
--
-- complete_onboarding() already excludes the caller (`id <> uid`) so the actual
-- submit would have succeeded - it was only the live availability check that lied.
--
-- Fix: exclude the caller's own row here too. auth.uid() is null for the
-- logged-out signup check, so coalesce to a uuid no real profile has - which
-- excludes nothing, exactly what we want there.
--
-- Pure create-or-replace of a security-definer function, no revoke: safe to run
-- directly on a live database (no two-phase needed).

create or replace function public.username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not exists (
      select 1 from public.profiles
      where lower(username) = lower(trim(candidate))
        and id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    )
    and not exists (
      select 1 from public.username_history h
      where lower(h.old_username) = lower(trim(candidate))
        and h.released_at > now() - interval '10 days'
        and h.profile_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    );
$$;

grant execute on function public.username_available(text) to anon, authenticated;


-- ############# addendum_033_realtime.sql #############

-- addendum_033: turn on Supabase Realtime for the two things that go stale (#101).
--
-- Nothing in the app is live today - the notifications bell and a show's
-- sold/sold-out count only change on reload. This adds the DB side of pushing
-- those two changes to the browser: the tables have to be members of the
-- `supabase_realtime` publication before Postgres will stream their changes to
-- subscribed clients. Scoped to exactly the two tables that mislead someone
-- when stale (Rauch principle 3), not "realtime everywhere".
--
-- RLS still applies to realtime: a browser only receives a change for a row it
-- is allowed to SELECT. `notifications` is recipient-scoped
-- (addendum_022: "auth.uid() = recipient_id"), so a fan only ever hears about
-- their own bell; `events` is publicly readable, which is what we want for a
-- live sold count. So this publication membership grants no new read access -
-- it only decides which tables emit a realtime stream at all.
--
-- Safe to run on a live database: it adds tables to a publication and sets
-- replica identity. No revoke, no data change, so no two-phase needed.
--
-- Run this in the Supabase SQL editor (staging first, then prod).

-- The publication ships with every Supabase project (usually empty). Create it
-- defensively in case a bare Postgres is ever used, then add our two tables
-- only if they aren't already members - re-adding an existing member errors,
-- so this stays idempotent and can be re-run without failing.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'events'
  ) then
    alter publication supabase_realtime add table public.events;
  end if;
end $$;

-- Why REPLICA IDENTITY FULL on notifications: the bell subscribes with the
-- filter `recipient_id=eq.<me>`. On INSERT/UPDATE the whole new row is in the
-- stream so the filter matches fine, but on DELETE only the replica-identity
-- columns are sent - by default just the primary key, which has no
-- recipient_id, so a "notification deleted" event would never reach the right
-- client. FULL puts every column in the DELETE payload so the per-user filter
-- still matches. Low write volume here, so the extra WAL is negligible.
alter table public.notifications replica identity full;

-- events is filtered by `id=eq.<event>` (the primary key), which is present in
-- the default replica identity for every operation we care about (we only ever
-- react to the sold count changing, i.e. UPDATE), so it needs no change.


-- ############# addendum_034_storage_usage.sql #############

-- addendum_034: a storage-usage figure for the admin dashboard (#100).
--
-- We're on Supabase Pro now (~100GB storage), so the point isn't to avoid a
-- bill - it's to *see* the number climb before it ever matters, and to sanity-
-- check that #96's client-side downscaling is actually keeping uploads small.
--
-- The size lives in `storage.objects` (each row carries `metadata->>'size'` in
-- bytes), but that table is in the `storage` schema, which PostgREST doesn't
-- expose - so the admin client can't just select from it. This function is the
-- bridge: a security-definer aggregate in `public`, callable over RPC, that
-- rolls the objects up per bucket. It reads only sizes and counts, never file
-- contents or paths.
--
-- Locked to service_role (the admin panel's client). Execute is revoked from
-- anon/authenticated so no logged-in user can call it - it would otherwise leak
-- the platform's total file footprint to anyone with the anon key.
--
-- Pure create-or-replace + grant, no revoke of anything in use: safe to run
-- directly on a live database.

create or replace function public.admin_storage_usage()
returns table (bucket_id text, bytes bigint, files bigint)
language sql
security definer
set search_path = public
as $$
  select
    o.bucket_id,
    -- Older objects can predate the size metadata; sum() skips the nulls and
    -- coalesce keeps a bucket of only-such-objects at 0 rather than null.
    coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint as bytes,
    count(*)::bigint as files
  from storage.objects o
  group by o.bucket_id
  order by bytes desc;
$$;

revoke all on function public.admin_storage_usage() from public, anon, authenticated;
grant execute on function public.admin_storage_usage() to service_role;
