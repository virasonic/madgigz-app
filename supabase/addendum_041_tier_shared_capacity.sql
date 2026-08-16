-- Addendum 041: ticket types share the room's capacity pool (#151 fix). An
-- artist can offer e.g. 100 General AND 20 VIP against a 100-cap room — the point
-- isn't that the type quantities sum to the capacity, it's that TOTAL sold never
-- exceeds it. So the mix floats (20 VIP + 80 General … 0 VIP + 100 General) up to
-- the shared 100.
--
-- The type's own "Available" is still a ceiling for that type; the new bit is the
-- reservation ALSO checks the event's total capacity, and rolls the type bump
-- back if the room is full. (addendum_039 only checked the type cap because back
-- then type caps were required to sum to capacity; that constraint is being
-- dropped in the app.)
--
-- SAFE TO RUN ON A LIVE DB, single phase (a function replace). Run on STAGING
-- first, verify a mixed-type buy fills to capacity and then blocks, then PROD.

create or replace function public.reserve_tier_capacity(p_tier_id uuid, p_quantity integer)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_event_id uuid;
begin
  -- 1. Reserve against the TYPE: its own availability, cutoff, and the event
  --    being live. Row-locks the tier so concurrent buyers serialize.
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

  -- 2. Reserve against the shared ROOM capacity. If the room can't hold it, undo
  --    the type bump (same transaction) and fail — types oversubscribe the room
  --    on purpose, so this is the real total cap.
  update public.events
     set sold = sold + p_quantity
   where id = v_event_id
     and sold + p_quantity <= capacity;

  if not found then
    update public.event_tiers set sold = sold - p_quantity where id = p_tier_id;
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.reserve_tier_capacity(uuid, integer) from public, anon, authenticated;
