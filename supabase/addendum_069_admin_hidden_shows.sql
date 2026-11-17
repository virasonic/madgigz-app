-- Addendum 069: a show MadGigz took down stays down (#229, item 4).
--
-- events.active is the one column an organiser may update on their own show
-- (addendum_026: grant update (active)), so they can hide and re-show it. But
-- an admin hiding a show, and cancelEvent, write the SAME column - so an
-- organiser could simply flip it back: re-list a show an admin removed, or put
-- a cancelled show (every ticket already refunded) back on sale.
--
-- This records WHO hid it and enforces it in the database, because the artist
-- toggle is a direct browser update that no server action sees:
--   * events.admin_hidden - true while an admin has hidden the show.
--   * a trigger that refuses active false -> true on a cancelled or
--     admin-hidden show unless the caller is an admin or the service role.
--
-- SAFE ON A LIVE DB - additive (one column, one trigger). No two-phase split:
-- nothing is revoked. Code that reads admin_hidden already tolerates the column
-- being absent, so order against the deploy doesn't matter.
--
-- CLASSIFICATION of admin_hidden: public. It says nothing the show being
-- invisible doesn't already say. Organisers get no update grant on it (update
-- on events is column-granted), so only the trigger and the service role write it.
--
-- Existing hidden shows are NOT backfilled: there is no record of who hid them,
-- so they default to organiser-hidden. To lock one, hide it again from /admin.
--
-- Run order: STAGING first, then PROD.
-- Verify: as an artist, hide your own show and re-show it (works); hide a show
-- from /admin/events, then try to re-show it as the artist (refused).

alter table public.events
  add column if not exists admin_hidden boolean not null default false;

comment on column public.events.admin_hidden is
  'True while an admin has hidden the show. Blocks the organiser re-activating it (addendum_069).';

create or replace function public.guard_event_reactivation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  caller_is_admin boolean := false;
begin
  -- The service role (server actions, cron, webhooks) has no auth.uid() and is
  -- trusted; those paths set admin_hidden themselves.
  if caller is null then
    return new;
  end if;

  select exists (
    select 1 from public.profiles p where p.id = caller and p.role = 'admin'
  ) into caller_is_admin;

  if caller_is_admin then
    -- An admin managing a show from the app (#157): their hide locks it, their
    -- re-show unlocks it.
    if old.active is distinct from new.active then
      new.admin_hidden := not coalesce(new.active, true);
    end if;
    return new;
  end if;

  -- Everyone else may never touch the flag, whatever their grants say.
  new.admin_hidden := old.admin_hidden;

  if coalesce(old.active, true) = false and coalesce(new.active, true) = true then
    if old.cancelled then
      raise exception 'This show was cancelled and cannot be re-listed.'
        using errcode = '42501';
    end if;
    if old.admin_hidden then
      raise exception 'This show was hidden by MadGigz and cannot be re-listed.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_event_reactivation() from public, anon, authenticated;

drop trigger if exists events_guard_reactivation on public.events;
create trigger events_guard_reactivation
  before update on public.events
  for each row
  execute function public.guard_event_reactivation();
