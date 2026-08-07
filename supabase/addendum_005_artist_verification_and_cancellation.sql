-- Addendum: artist verification gate + admin event cancellation with refund
-- bookkeeping. Run this once in the Supabase SQL Editor.

-- ============ ARTIST VERIFICATION ============

create type artist_status as enum ('pending', 'approved', 'rejected');

alter table public.profiles add column if not exists artist_status artist_status;
alter table public.profiles add column if not exists evidence_url text;

-- Grandfather existing artist accounts so this doesn't lock out anyone
-- already using the app - only new signups start out pending.
update public.profiles set artist_status = 'approved'
where role = 'artist' and artist_status is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, role, date_of_birth, artist_status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'fan'),
    nullif(new.raw_user_meta_data->>'date_of_birth', '')::date,
    case
      when coalesce((new.raw_user_meta_data->>'role')::user_role, 'fan') = 'artist'
      then 'pending'::artist_status
      else null
    end
  );
  return new;
end;
$$;

drop policy if exists "Artists can insert their own events" on public.events;
create policy "Approved artists can insert their own events" on public.events
  for insert with check (
    auth.uid() = artist_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and artist_status = 'approved'
    )
  );

drop policy if exists "Artists can insert their own content" on public.content_posts;
create policy "Approved artists can insert their own content" on public.content_posts
  for insert with check (
    auth.uid() = artist_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and artist_status = 'approved'
    )
  );

-- ============ ADMIN EVENT CANCELLATION ============
-- No real payment processor exists yet, so "refunded" is a bookkeeping flag
-- for the admin to act on manually (bank transfer etc.), not a real
-- transaction. Cancelling an event with tickets sold soft-deletes it
-- (active=false, cancelled=true) rather than hard-deleting, so the ticket
-- rows survive as a record of who's owed a refund.

alter table public.events add column if not exists cancelled boolean not null default false;
alter table public.tickets add column if not exists refunded boolean not null default false;
