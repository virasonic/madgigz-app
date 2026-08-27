-- addendum_045_event_shares.sql
--
-- Adds "shares" to the event interest signals (extends addendum_044). Shares are
-- stored in the SAME event_link_clicks table under kind='share'; ticket clicks
-- keep the column default kind='ticket_click', so addendum_044 and the existing
-- record_event_link_click RPC are unchanged. Run AFTER addendum_044.
--
-- Safe on a live DB (additive). Code ships first and degrades until this runs:
-- record_event_share is fire-and-forget (swallows the missing-function 42883),
-- and the admin dashboard derives clicks as (total rows − shares), so a missing
-- kind column just yields shares=0 and clicks=total, exactly the pre-share state.

alter table public.event_link_clicks
  add column if not exists kind text not null default 'ticket_click';

create or replace function public.record_event_share(p_event_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.events where id = p_event_id) then
    return;
  end if;
  insert into public.event_link_clicks (event_id, user_id, kind)
  values (p_event_id, auth.uid(), 'share');
end;
$$;

grant execute on function public.record_event_share(uuid) to anon, authenticated;
