-- Addendum 036: one ticket row (and QR) per seat, not one row per order.
--
-- WHY: buying N tickets used to create a single tickets row with quantity = N
-- and one QR. That blocks per-ticket transfer (#145), per-ticket wallet passes,
-- and per-seat check-in. Now each seat is its own row (quantity 1) with its own
-- id — so the app, which already renders one card/QR/pass per ticket row and
-- refunds per row, gets separate tickets for free. The order's price and fees
-- are split evenly across the seats (remainder cents on the first seats) so the
-- rows sum back to exactly the order total — this matters because per-ticket
-- refunds refund each row's own price_paid.
--
-- SAFE TO RUN ON A LIVE DB. Two phases are NOT needed: the app code that ships
-- before this degrades fine (fulfilment calls fulfil_ticket the same way and
-- gets back the first ticket id; the refund path reads each row's price_paid,
-- which for a pre-migration single row is the whole order = today's behaviour).
-- Existing multi-quantity rows are left as-is (seat stays null); only new
-- purchases split. Run on STAGING first, verify a multi-ticket buy makes N rows
-- with N QRs, then PROD.

-- 1. Per-seat index within an order (1..N). Null on legacy single rows.
alter table public.tickets add column if not exists seat smallint;

-- 2. Idempotency moves from "one row per checkout session" to "one row per seat
--    in a session". Drop the old single-row unique index (its current name is
--    from addendum_006) and replace it with (session, seat). Without this the
--    second seat of an order would conflict on stripe_session_id and be dropped.
drop index if exists public.tickets_stripe_session_id_key;
create unique index if not exists tickets_session_seat_key
  on public.tickets (stripe_session_id, seat)
  where stripe_session_id is not null;

-- 3. Fulfilment creates N rows, one per seat, splitting money exactly.
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
    -- Even split; the leftover cents land on the first seats so the N rows sum
    -- back to the exact order total (integer division floors, so 0..v_qty-1
    -- cents remain, handed to seats 1..remainder).
    v_price_cents := v_total_cents / v_qty + (case when i <= (v_total_cents % v_qty) then 1 else 0 end);
    v_fee_cents   := v_fee_total   / v_qty + (case when i <= (v_fee_total   % v_qty) then 1 else 0 end);
    v_vat_cents   := v_vat_total   / v_qty + (case when i <= (v_vat_total   % v_qty) then 1 else 0 end);

    insert into public.tickets (
      user_id, event_id, quantity, seat, price_paid, discount_id,
      stripe_session_id, stripe_payment_intent_id, application_fee_cents,
      stripe_account_id, application_fee_vat_cents
    )
    values (
      p_user_id, p_event_id, 1, i, v_price_cents / 100.0, p_discount_id,
      p_stripe_session_id, p_stripe_payment_intent_id, v_fee_cents,
      p_stripe_account_id, v_vat_cents
    )
    -- Partial index predicate repeated so Postgres can infer the arbiter.
    on conflict (stripe_session_id, seat) where stripe_session_id is not null do nothing
    returning id into v_ticket_id;

    if v_ticket_id is not null then
      v_created := v_created + 1;
      if v_first_ticket_id is null then
        v_first_ticket_id := v_ticket_id;
      end if;
    end if;
  end loop;

  -- One promo use per ORDER, not per seat, and only if this call actually
  -- created rows (a webhook/success-page retry conflicts on every seat and
  -- creates none). max_uses enforced in the same statement so concurrent
  -- redemptions can't blow past the cap.
  if v_created > 0 and p_discount_id is not null then
    update public.discounts
       set used_count = used_count + 1
     where id = p_discount_id
       and (max_uses is null or used_count < max_uses);
  end if;

  -- The first seat's id (callers use it only for a free-ticket redirect and a
  -- null/not-null "was anything created?" check).
  return v_first_ticket_id;
end;
$$;

-- create-or-replace keeps existing privileges, but re-assert the hardening from
-- addendum_006 so this function is never callable directly by a signed-in fan
-- (it runs security-definer and could otherwise be called with any price).
revoke all on function public.fulfil_ticket(uuid, uuid, integer, numeric, uuid, text, text, integer, text, integer)
  from public, anon, authenticated;
