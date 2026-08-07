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
