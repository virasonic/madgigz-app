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
