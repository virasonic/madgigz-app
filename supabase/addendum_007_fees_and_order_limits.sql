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
