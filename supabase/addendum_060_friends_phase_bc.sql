-- addendum_060_friends_phase_bc.sql
--
-- #149 Phases B and C, on top of addendum_059.
--
-- B: sending a gig (or a spare ticket) to a friend INSIDE the app. Not a chat:
--    each is one notification row, written only by a security-definer function
--    that checks the two people are accepted friends. The optional note (140
--    chars) and the claim token ride in a new notifications.payload jsonb.
--
-- C: fan photos (#195). An attendee of a PAST show (scanned-in ticket or a
--    manual "I was there") can add up to 3 photos to it. Nothing is public until
--    the organiser approves it; the organiser can only approve or hide, never
--    edit; the fan can delete their own. Organiser = events.artist_id or
--    events.pro_account_id, or an admin.
--
-- Classification:
--   notifications.payload   owner-only (the table already is)
--   fan_photos              status='approved' rows are PUBLIC (they appear on the
--                           show page, which guests can open). Pending/hidden rows
--                           are visible only to their owner and the organiser.
--                           The public row carries user_id, which is a deliberate
--                           byline: a fan posting to a show is publishing, and a
--                           byline is avatar + username, exactly what any
--                           non-friend may already see of them.
--
-- SAFE TO RUN ON A LIVE DB, single phase, additive. Code ships first and
-- degrades: readers catch 42P01 / PGRST205 / 42883 / PGRST202 and render nothing.
-- Run on STAGING first, then PROD.

-- ---------------------------------------------------------------------------
-- Notifications: payload + four new types
-- ---------------------------------------------------------------------------

alter table public.notifications add column if not exists payload jsonb;

comment on column public.notifications.payload is
  'Per-type extras: event_shared {note}, ticket_offer {token}. Owner-only like the row.';

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type in (
    'tagged_in_event',
    'new_follower',
    'followed_artist_show',
    'event_upcoming',
    'ticket_sold',
    'friend_request',
    'friend_accepted',
    'friend_going',
    'event_shared',
    'ticket_offer',
    'fan_photo_pending',
    'fan_photo_approved'
  )
);

-- "Send to a friend": one notification per recipient, only to accepted friends
-- of the caller, only for a live show. Returns how many were sent, so the UI
-- can say "Sent to 2 friends" from the read-back rather than the request.
create or replace function public.send_event_to_friends(
  p_event_id uuid,
  p_friend_ids uuid[],
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  note text := nullif(left(btrim(coalesce(p_note, '')), 140), '');
  n integer;
begin
  if me is null or p_event_id is null then
    return 0;
  end if;
  if not exists (select 1 from public.events e where e.id = p_event_id and e.active) then
    return 0;
  end if;

  insert into public.notifications (recipient_id, type, actor_id, event_id, payload)
  select distinct f_id, 'event_shared', me, p_event_id,
         case when note is null then null else jsonb_build_object('note', note) end
  from unnest(coalesce(p_friend_ids, '{}'::uuid[])) as f_id
  join public.friendships fr
    on fr.status = 'accepted'
   and fr.user_a = least(me, f_id)
   and fr.user_b = greatest(me, f_id)
  where f_id <> me;

  get diagnostics n = row_count;
  return n;
end;
$$;

grant execute on function public.send_event_to_friends(uuid, uuid[], text) to authenticated;

-- "Send the spare ticket to a friend": the claim link already exists (#145,
-- createTransfer); this delivers it as an in-app notification to one accepted
-- friend. The token is checked to belong to a live transfer the caller created.
create or replace function public.offer_ticket_to_friend(p_friend_id uuid, p_token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  ev uuid;
begin
  if me is null or p_friend_id is null or p_friend_id = me or p_token is null then
    return false;
  end if;
  if not exists (
    select 1 from public.friendships fr
    where fr.status = 'accepted'
      and fr.user_a = least(me, p_friend_id)
      and fr.user_b = greatest(me, p_friend_id)
  ) then
    return false;
  end if;

  select t.event_id into ev
  from public.ticket_transfers tr
  join public.tickets t on t.id = tr.ticket_id
  where tr.token = p_token
    and tr.from_user_id = me
    and tr.status = 'pending';
  if ev is null then
    return false;
  end if;

  insert into public.notifications (recipient_id, type, actor_id, event_id, payload)
  values (p_friend_id, 'ticket_offer', me, ev, jsonb_build_object('token', p_token));
  return true;
end;
$$;

grant execute on function public.offer_ticket_to_friend(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Fan photos (#195)
-- ---------------------------------------------------------------------------

create table if not exists public.fan_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  media_url text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null
);

create index if not exists fan_photos_event_status_idx on public.fan_photos (event_id, status, created_at desc);
create index if not exists fan_photos_user_idx on public.fan_photos (user_id, created_at desc);

-- Did this person attend this (past) show? Scanned-in ticket or a manual mark.
-- Security definer because tickets/attended_events are owner-only and this is
-- evaluated inside a policy.
create or replace function public.attended_event(p_user uuid, p_event uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.events e where e.id = p_event and e.event_date < current_date)
     and (
       exists (
         select 1 from public.tickets t
         where t.user_id = p_user and t.event_id = p_event
           and t.checked_in_at is not null and t.hidden_at is null
       )
       or exists (
         select 1 from public.attended_events a
         where a.user_id = p_user and a.event_id = p_event
       )
     );
$$;

-- Who may review photos on a show: its artist, its promoter/venue, or an admin.
create or replace function public.manages_event(p_event uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select auth.uid() is not null and (
    exists (
      select 1 from public.events e
      where e.id = p_event
        and (e.artist_id = auth.uid() or e.pro_account_id = auth.uid())
    )
    or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
    )
  );
$$;

alter table public.fan_photos enable row level security;

create policy "Approved fan photos are public" on public.fan_photos
  for select using (status = 'approved');

create policy "Fans see their own photos" on public.fan_photos
  for select using (auth.uid() = user_id);

create policy "Organisers see every photo on their shows" on public.fan_photos
  for select using (public.manages_event(event_id));

create policy "Attendees add photos" on public.fan_photos
  for insert with check (
    auth.uid() = user_id
    and status = 'pending'
    and public.attended_event(auth.uid(), event_id)
  );

-- Review = approve or hide. The trigger below stops anything else changing.
create policy "Organisers review photos" on public.fan_photos
  for update using (public.manages_event(event_id))
  with check (public.manages_event(event_id) and status in ('approved', 'hidden'));

create policy "Fans delete their own photos" on public.fan_photos
  for delete using (auth.uid() = user_id);

-- The 3-per-fan-per-show cap, and the "review only touches status" rule. Both
-- in a trigger rather than a policy: a count inside a policy would itself be
-- subject to RLS, and a policy cannot compare old and new.
create or replace function public.fan_photos_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.fan_photos p
        where p.user_id = new.user_id and p.event_id = new.event_id) >= 3 then
      raise exception 'fan_photos_limit' using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.user_id <> old.user_id or new.event_id <> old.event_id or new.media_url <> old.media_url then
    raise exception 'fan_photos_immutable' using errcode = 'check_violation';
  end if;
  if new.status <> old.status then
    new.reviewed_at := now();
    new.reviewed_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists fan_photos_guard on public.fan_photos;
create trigger fan_photos_guard
  before insert or update on public.fan_photos
  for each row execute function public.fan_photos_guard();

-- The organiser hears once per (fan, show) however many photos arrive; the fan
-- hears once per (show) when the first one is approved.
create unique index if not exists notifications_fan_photo_pending_once
  on public.notifications (recipient_id, actor_id, event_id)
  where type = 'fan_photo_pending';

create unique index if not exists notifications_fan_photo_approved_once
  on public.notifications (recipient_id, event_id)
  where type = 'fan_photo_approved';

create or replace function public.notify_fan_photo_pending()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (recipient_id, type, actor_id, event_id)
  select distinct r.id, 'fan_photo_pending', new.user_id, new.event_id
  from public.events e
  cross join lateral (values (e.artist_id), (e.pro_account_id)) as r(id)
  where e.id = new.event_id
    and r.id is not null
    and r.id <> new.user_id
  on conflict (recipient_id, actor_id, event_id) where type = 'fan_photo_pending' do nothing;
  return null;
end;
$$;

drop trigger if exists fan_photos_notify_pending on public.fan_photos;
create trigger fan_photos_notify_pending
  after insert on public.fan_photos
  for each row execute function public.notify_fan_photo_pending();

create or replace function public.notify_fan_photo_approved()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status <> 'approved' and new.status = 'approved' then
    insert into public.notifications (recipient_id, type, actor_id, event_id)
    values (new.user_id, 'fan_photo_approved', auth.uid(), new.event_id)
    on conflict (recipient_id, event_id) where type = 'fan_photo_approved' do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists fan_photos_notify_approved on public.fan_photos;
create trigger fan_photos_notify_approved
  after update of status on public.fan_photos
  for each row execute function public.notify_fan_photo_approved();
