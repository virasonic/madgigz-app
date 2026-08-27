-- addendum_044_event_link_clicks.sql
--
-- Track ticket-link interest per event - external-ticket-link opens and
-- in-app checkout starts - and surface it on the admin event dashboard next to
-- sales (#clicks). One row per click; raw count, repeat taps included. No
-- sensitive data: event_id, an optional user_id, and a timestamp.
--
-- Reads are service_role-only (admin metrics); fans record a click through a
-- security-definer RPC, so the table is never writable by anon/authenticated
-- directly. "saves" needs no migration - it's a count of the existing
-- saved_events rows.
--
-- Safe on a live DB (purely additive). Code ships first and degrades until this
-- runs: the client RPC call is fire-and-forget and swallows the missing-function
-- error (42883), and the admin read catches the missing-table error (42P01) and
-- shows 0.

create table if not exists public.event_link_clicks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists event_link_clicks_event_idx
  on public.event_link_clicks (event_id);

alter table public.event_link_clicks enable row level security;
-- No anon/authenticated policies on purpose: RLS enabled + no policy closes the
-- table to those roles for direct select/insert. service_role bypasses RLS for
-- the admin dashboard read; all inserts go through the RPC below.

create or replace function public.record_event_link_click(p_event_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  -- Ignore anything that isn't a real event, so a bad id can't grow the table.
  if not exists (select 1 from public.events where id = p_event_id) then
    return;
  end if;
  insert into public.event_link_clicks (event_id, user_id)
  values (p_event_id, auth.uid());
end;
$$;

grant execute on function public.record_event_link_click(uuid) to anon, authenticated;
