-- Addendum 039: multiple price tiers per show (#151). An event can offer several
-- ticket options at once — e.g. General €12 (max 150), VIP €20 (max 20) — each
-- with its own price, sold-cap and optional on-sale-until cutoff. The fan picks
-- one at checkout.
--
-- ADDITIVE AND OPTIONAL. An event with NO tiers behaves exactly as today: single
-- events.price / events.capacity, reserved through reserve_event_capacity. Only
-- an event that has event_tiers rows switches to per-tier pricing. For a tiered
-- event we keep events.capacity = Σ tier.capacity, events.price = the lowest tier
-- price ("from €x" on cards), and events.sold = Σ tier.sold — maintained by the
-- tier reserve/release below — so every existing sold-out / almost-gone / metrics
-- read (which all key off events.sold/capacity) stays correct without change.
--
-- MONEY PATH. Reservation moves to the tier (guarded by cap + cutoff + event
-- live), fulfilment stamps tickets.tier_id, and a refund releases that tier —
-- mirroring the reserve→fulfil→release discipline addendum_006 established for
-- events.sold (the insert trigger was dropped there; sold is counter-managed).
--
-- SAFE TO RUN ON A LIVE DB, single phase. Code that ships before this degrades:
-- checkout/fulfilment pass p_tier_id only when a tier is chosen (null otherwise),
-- tier reads catch the missing table (42P01) and fall back to the single price,
-- and no existing event has tiers so nothing changes until one is created. Run on
-- STAGING first, verify a tiered buy + refund, then PROD.

-- 1. The tiers. sold is a denormalized counter kept correct by the reserve/
--    release functions below (same pattern as events.sold).
create table if not exists public.event_tiers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  price numeric(10,2) not null default 0,
  capacity integer not null default 0,
  sold integer not null default 0,
  available_until timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists event_tiers_event_id_idx on public.event_tiers (event_id);

-- Which tier a ticket was bought at (#151). Null for a single-price event or any
-- ticket bought before this ran — the refund path then releases the event, not a
-- tier.
alter table public.tickets add column if not exists tier_id uuid references public.event_tiers(id);

-- 2. RLS. Tiers are public to read (like events — a browsing fan needs the price
--    list). Every WRITE goes through the service-role server actions in
--    profile/show-actions.ts / admin, which recompute events.capacity+price from
--    the tiers — so no insert/update/delete grant to the browser.
alter table public.event_tiers enable row level security;

create policy "Tiers are viewable by everyone" on public.event_tiers
  for select using (true);

grant select on public.event_tiers to anon, authenticated;

-- 3. Atomic per-tier reservation. Bumps the tier's sold (guarded by its cap and
--    cutoff, and the event being live) AND the event aggregate, in one
--    transaction. The tier UPDATE takes a row lock, so two fans racing the last
--    VIP seat can't both win — same guarantee reserve_event_capacity gives.
create or replace function public.reserve_tier_capacity(p_tier_id uuid, p_quantity integer)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_event_id uuid;
begin
  update public.event_tiers t
     set sold = t.sold + p_quantity
    from public.events e
   where t.id = p_tier_id
     and e.id = t.event_id
     and e.active = true
     and e.cancelled = false
     and (t.available_until is null or t.available_until > now())
     and t.sold + p_quantity <= t.capacity
  returning t.event_id into v_event_id;

  if v_event_id is null then
    return false;
  end if;

  update public.events set sold = sold + p_quantity where id = v_event_id;
  return true;
end;
$$;

-- Give a held tier seat back (abandoned checkout, failed async payment, refund).
-- Floors at 0 so a double-release can't drive a counter negative.
create or replace function public.release_tier_capacity(p_tier_id uuid, p_quantity integer)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_event_id uuid;
begin
  update public.event_tiers
     set sold = greatest(sold - p_quantity, 0)
   where id = p_tier_id
  returning event_id into v_event_id;

  if v_event_id is not null then
    update public.events set sold = greatest(sold - p_quantity, 0) where id = v_event_id;
  end if;
end;
$$;

-- 4. Fulfilment stamps the tier on each seat. Recreated (not overloaded) with a
--    new p_tier_id — the 10-arg signature from addendum_036 is dropped first so a
--    named-arg call that omits p_tier_id can't become ambiguous between the two.
drop function if exists public.fulfil_ticket(uuid, uuid, integer, numeric, uuid, text, text, integer, text, integer);

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
  p_application_fee_vat_cents integer default 0,
  p_tier_id uuid default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_qty integer := greatest(coalesce(p_quantity, 1), 1);
  v_total_cents integer := round(coalesce(p_price_paid, 0) * 100)::integer;
  v_fee_total integer := coalesce(p_application_fee_cents, 0);
  v_vat_total integer := coalesce(p_application_fee_vat_cents, 0);
  v_created integer := 0;
  v_first_ticket_id uuid;
  v_ticket_id uuid;
  v_price_cents integer;
  v_fee_cents integer;
  v_vat_cents integer;
  i integer;
begin
  for i in 1..v_qty loop
    v_price_cents := v_total_cents / v_qty + (case when i <= (v_total_cents % v_qty) then 1 else 0 end);
    v_fee_cents   := v_fee_total   / v_qty + (case when i <= (v_fee_total   % v_qty) then 1 else 0 end);
    v_vat_cents   := v_vat_total   / v_qty + (case when i <= (v_vat_total   % v_qty) then 1 else 0 end);

    insert into public.tickets (
      user_id, event_id, quantity, seat, price_paid, discount_id,
      stripe_session_id, stripe_payment_intent_id, application_fee_cents,
      stripe_account_id, application_fee_vat_cents, tier_id
    )
    values (
      p_user_id, p_event_id, 1, i, v_price_cents / 100.0, p_discount_id,
      p_stripe_session_id, p_stripe_payment_intent_id, v_fee_cents,
      p_stripe_account_id, v_vat_cents, p_tier_id
    )
    on conflict (stripe_session_id, seat) where stripe_session_id is not null do nothing
    returning id into v_ticket_id;

    if v_ticket_id is not null then
      v_created := v_created + 1;
      if v_first_ticket_id is null then
        v_first_ticket_id := v_ticket_id;
      end if;
    end if;
  end loop;

  if v_created > 0 and p_discount_id is not null then
    update public.discounts
       set used_count = used_count + 1
     where id = p_discount_id
       and (max_uses is null or used_count < max_uses);
  end if;

  return v_first_ticket_id;
end;
$$;

-- Service-role only, same hardening as addendum_006/036 — these run
-- security-definer and must never be callable by a signed-in fan directly.
revoke all on function public.reserve_tier_capacity(uuid, integer) from public, anon, authenticated;
revoke all on function public.release_tier_capacity(uuid, integer) from public, anon, authenticated;
revoke all on function public.fulfil_ticket(uuid, uuid, integer, numeric, uuid, text, text, integer, text, integer, uuid)
  from public, anon, authenticated;
