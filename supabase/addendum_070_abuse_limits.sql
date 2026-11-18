-- Addendum 070: three abuse limits (#229, items 6, 7, 9 and 13).
--
-- 1. CHECKOUT HOLDS. createCheckout reserves seats before the fan pays and the
--    Stripe session holds them for 30 minutes. Nothing recorded who held what,
--    so one account could open checkouts without limit and make a show look
--    sold out without paying. checkout_holds records each open hold; the app
--    caps them per account, and replaces a fan's earlier unpaid checkout for
--    the same show instead of stacking a second one.
--    The same row makes releasing a seat idempotent (item 9): release deletes
--    the row and gives the seats back in ONE transaction, so a duplicate
--    webhook delivery finds no row and releases nothing.
--
-- 2. STREAM UPLOAD QUOTA. Any signed-in account could mint Cloudflare Stream
--    upload URLs without limit, each reserving up to 10 minutes of video.
--    stream_upload_mints logs each mint; claim_stream_upload refuses past the cap.
--
-- 3. EVENT-MEDIA BUCKET. No size or type limit, and the select policy let anyone
--    LIST every object, including fan photos awaiting approval. Adds a 50 MB
--    limit and an image/video allow-list (no SVG: it can carry script), and
--    narrows listing to your own files.
--
-- SAFE ON A LIVE DB, single phase.
--   * Parts 1 and 2 are additive. The code tolerates the tables and functions
--     being absent and behaves as before until this runs.
--   * Part 3 removes access (anyone-can-list), which would normally need the
--     two-phase split. It doesn't here: nothing deployed lists the bucket or
--     reads storage.objects with a user session except to delete its own file,
--     which the replacement policy still allows. PUBLIC URLS ARE UNAFFECTED - a
--     public bucket serves objects without consulting the select policy.
--
-- CLASSIFICATION: both new tables are service-role-only. RLS is on with no
-- policies and every grant is revoked; only server actions and the webhook
-- touch them.
--
-- Run order: STAGING first, then PROD.
-- Verify:
--   * start a checkout on a show, go back, start it again: one row in
--     checkout_holds for you, and events.sold rose by the quantity once, not twice.
--   * anon `GET /storage/v1/object/list/event-media` returns no objects.
--   * an existing poster URL still loads.

-- ============ 1. CHECKOUT HOLDS ============

create table if not exists public.checkout_holds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  -- A deleted tier falls back to releasing against the event (below).
  tier_id uuid references public.event_tiers(id) on delete set null,
  quantity integer not null check (quantity > 0),
  -- Null for the moment between reserving and Stripe answering.
  stripe_session_id text unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists checkout_holds_user_open_idx
  on public.checkout_holds (user_id, expires_at);

alter table public.checkout_holds enable row level security;
revoke all on public.checkout_holds from anon, authenticated;

-- Records a hold, unless the account already has p_max_open live ones. Returns
-- the hold id, or null when the cap is reached. The advisory lock serialises
-- one account's checkouts, so parallel requests can't each pass the count.
create or replace function public.open_checkout_hold(
  p_user_id uuid,
  p_event_id uuid,
  p_tier_id uuid,
  p_quantity integer,
  p_ttl_seconds integer,
  p_max_open integer
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_open integer;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select count(*) into v_open
    from public.checkout_holds
   where user_id = p_user_id and expires_at > now();
  if v_open >= p_max_open then
    return null;
  end if;

  insert into public.checkout_holds (user_id, event_id, tier_id, quantity, expires_at)
  values (p_user_id, p_event_id, p_tier_id, p_quantity, now() + make_interval(secs => p_ttl_seconds))
  returning id into v_id;
  return v_id;
end;
$$;

-- Gives a hold's seats back exactly once. True if this call released them,
-- false if the hold was already gone (released earlier, or paid for).
create or replace function public.release_checkout_hold(p_hold_id uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_hold public.checkout_holds%rowtype;
begin
  delete from public.checkout_holds where id = p_hold_id returning * into v_hold;
  if not found then
    return false;
  end if;

  if v_hold.tier_id is not null then
    perform public.release_tier_capacity(v_hold.tier_id, v_hold.quantity);
  else
    perform public.release_event_capacity(v_hold.event_id, v_hold.quantity);
  end if;
  return true;
end;
$$;

revoke all on function public.open_checkout_hold(uuid, uuid, uuid, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.release_checkout_hold(uuid) from public, anon, authenticated;
grant execute on function public.open_checkout_hold(uuid, uuid, uuid, integer, integer, integer)
  to service_role;
grant execute on function public.release_checkout_hold(uuid) to service_role;

-- ============ 2. STREAM UPLOAD QUOTA ============

create table if not exists public.stream_upload_mints (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists stream_upload_mints_user_idx
  on public.stream_upload_mints (user_id, created_at);

alter table public.stream_upload_mints enable row level security;
revoke all on public.stream_upload_mints from anon, authenticated;

-- True and logs the mint if the account is under p_max in the window; false
-- otherwise. Also clears that account's rows from before the window, so the
-- table stays the size of recent activity.
create or replace function public.claim_stream_upload(
  p_user_id uuid,
  p_max integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_since timestamptz := now() - make_interval(secs => p_window_seconds);
  v_used integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('stream:' || p_user_id::text, 0));

  delete from public.stream_upload_mints where user_id = p_user_id and created_at < v_since;

  select count(*) into v_used from public.stream_upload_mints where user_id = p_user_id;
  if v_used >= p_max then
    return false;
  end if;

  insert into public.stream_upload_mints (user_id) values (p_user_id);
  return true;
end;
$$;

revoke all on function public.claim_stream_upload(uuid, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_stream_upload(uuid, integer, integer) to service_role;

-- ============ 3. EVENT-MEDIA BUCKET ============

-- 50 MB matches the ceiling the upload forms already state. Reel video goes to
-- Cloudflare Stream; this bucket only takes video as a fallback and for admin
-- announcements. The limits apply to service-role uploads too.
update storage.buckets
   set file_size_limit = 52428800,
       allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
         'image/heic', 'image/heif',
         'video/mp4', 'video/quicktime', 'video/webm'
       ]
 where id = 'event-media';

-- Current name, from schema.sql; no later addendum renamed it.
drop policy if exists "Event media is publicly accessible" on storage.objects;

-- Deleting your own upload (addendum_004) needs to see the row first.
drop policy if exists "Owners can see their own event media" on storage.objects;
create policy "Owners can see their own event media" on storage.objects
  for select to authenticated
  using (bucket_id = 'event-media' and auth.uid() = owner);
