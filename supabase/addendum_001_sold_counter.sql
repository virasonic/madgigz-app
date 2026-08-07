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
