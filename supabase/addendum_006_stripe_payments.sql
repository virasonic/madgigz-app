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
