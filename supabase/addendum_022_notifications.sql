-- Backlog #86: in-app notifications.
--
-- Rows are created by database triggers rather than by the app. The events that
-- matter here - being tagged, gaining a follower, an artist you follow
-- publishing a show - all already happen through inserts, and putting the
-- notification next to the insert means it cannot be forgotten at one of the
-- several call sites that can cause it (an artist tagging a support act, an
-- admin tagging one from the panel, and later a promoter doing the same).
--
-- Run this in the Supabase SQL editor.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  -- Text with a check rather than a pg enum: adding a type later is an ALTER
  -- on the constraint, not a migration that has to touch a type other objects
  -- depend on.
  type text not null check (
    type in ('tagged_in_event', 'new_follower', 'followed_artist_show', 'event_upcoming')
  ),
  -- Who caused it, where relevant. on delete set null so a deleted account
  -- doesn't take the notification with it.
  actor_id uuid references public.profiles(id) on delete set null,
  event_id uuid references public.events(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_idx
  on public.notifications (recipient_id, created_at desc);

-- Stops the nightly "your gig is tomorrow" sweep sending the same reminder
-- twice if it runs more than once in a day.
create unique index if not exists notifications_upcoming_once
  on public.notifications (recipient_id, event_id)
  where type = 'event_upcoming';

alter table public.notifications enable row level security;

create policy "Users read their own notifications" on public.notifications
  for select using (auth.uid() = recipient_id);

-- Marking as read is the only thing a user may change, and only on their own.
create policy "Users mark their own notifications read" on public.notifications
  for update using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);

create policy "Users delete their own notifications" on public.notifications
  for delete using (auth.uid() = recipient_id);

-- No insert policy at all. Every row comes from the security-definer triggers
-- below or from the cron sweep on the service role, so nobody can post a
-- notification into someone else's list.

create or replace function public.notify_on_tag()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (recipient_id, type, event_id, actor_id)
  select new.profile_id, 'tagged_in_event', new.event_id, e.artist_id
  from public.events e
  where e.id = new.event_id
    -- Tagging yourself on your own show isn't news.
    and (e.artist_id is null or e.artist_id <> new.profile_id);
  return null;
end;
$$;

drop trigger if exists event_artists_notify on public.event_artists;
create trigger event_artists_notify
  after insert on public.event_artists
  for each row execute function public.notify_on_tag();

create or replace function public.notify_on_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (recipient_id, type, actor_id)
  values (new.artist_id, 'new_follower', new.follower_id);
  return null;
end;
$$;

drop trigger if exists follows_notify on public.follows;
create trigger follows_notify
  after insert on public.follows
  for each row execute function public.notify_on_follow();

-- A followed artist publishing a show. Fires on insert and on an event being
-- un-hidden, since a show created hidden and revealed later is new to a fan
-- either way.
create or replace function public.notify_followers_of_show()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.artist_id is null or new.active is not true or new.cancelled then
    return null;
  end if;

  if tg_op = 'UPDATE' and old.active is true then
    return null;
  end if;

  insert into public.notifications (recipient_id, type, event_id, actor_id)
  select f.follower_id, 'followed_artist_show', new.id, new.artist_id
  from public.follows f
  where f.artist_id = new.artist_id
  -- Belt and braces: the unique index below doesn't cover this type, so guard
  -- against an update path sending a second copy.
  and not exists (
    select 1 from public.notifications n
    where n.recipient_id = f.follower_id
      and n.event_id = new.id
      and n.type = 'followed_artist_show'
  );
  return null;
end;
$$;

drop trigger if exists events_notify_followers on public.events;
create trigger events_notify_followers
  after insert or update of active on public.events
  for each row execute function public.notify_followers_of_show();
