-- addendum_059_friends.sql
--
-- #149 Phase A: a fan-to-fan friends graph. Mutual (request + accept), with
-- "what my friends are going to" readable ONLY by accepted friends and ONLY
-- through a security-definer function, never by opening the underlying tables.
--
-- Classification:
--   friendships        OWNER-ONLY rows: either party can read their own rows;
--                      a request is an insert by the requester; acceptance is
--                      the accept_friend_request() RPC (no UPDATE policy at all,
--                      because a permissive update policy would let a recipient
--                      rewrite who the row is between); either party deletes
--                      (decline, cancel, unfriend are all the same delete).
--   fan_preferences.share_interested  OWNER-ONLY (the table already is).
--   friend_activity()  SECURITY DEFINER. Reads tickets / saved_events /
--                      attended_events for the caller's ACCEPTED friends only.
--                      Going and Been are always shared; Interested (hearted)
--                      only when that friend's share_interested is true.
--   friend_suggestions()  SECURITY DEFINER. Friends-of-friends with a mutual
--                      count, never anyone's full friend list.
--   notifications      three new types; rows still come only from triggers.
--
-- Nothing here is publicly readable. A fan's social graph, tickets and saved
-- shows stay invisible to non-friends exactly as before.
--
-- SAFE TO RUN ON A LIVE DB, single phase, additive. The app ships first and
-- degrades until this runs: every reader catches 42P01 / 42883 and renders the
-- friends surfaces empty. Run on STAGING first, then PROD.

-- ---------------------------------------------------------------------------
-- The graph
-- ---------------------------------------------------------------------------

create table if not exists public.friendships (
  -- One row per pair, stored in canonical order so (A,B) and (B,A) can never
  -- both exist. user_a < user_b also rules out befriending yourself.
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (user_a, user_b),
  constraint friendships_ordered check (user_a < user_b),
  constraint friendships_requester_is_party check (requested_by in (user_a, user_b))
);

create index if not exists friendships_user_b_idx on public.friendships (user_b);

alter table public.friendships enable row level security;

create policy "Parties see their own friendships" on public.friendships
  for select using (auth.uid() in (user_a, user_b));

-- A request: you insert a pending row naming yourself as the requester. The
-- other party is whoever you like - that is what a request is.
create policy "Users send friend requests" on public.friendships
  for insert with check (
    auth.uid() = requested_by
    and auth.uid() in (user_a, user_b)
    and status = 'pending'
  );

-- Decline, cancel and unfriend are all "the row goes away", by either party.
create policy "Parties remove friendships" on public.friendships
  for delete using (auth.uid() in (user_a, user_b));

-- Deliberately NO update policy. Acceptance goes through the function below so
-- the only thing that can ever change on a row is pending -> accepted, by the
-- person who did not send it.

create or replace function public.accept_friend_request(p_requester uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null or p_requester is null or me = p_requester then
    return false;
  end if;
  update public.friendships
    set status = 'accepted', accepted_at = now()
    where user_a = least(me, p_requester)
      and user_b = greatest(me, p_requester)
      and requested_by = p_requester
      and status = 'pending';
  return found;
end;
$$;

grant execute on function public.accept_friend_request(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Privacy toggle: whether friends may see the shows I've hearted
-- ---------------------------------------------------------------------------

alter table public.fan_preferences
  add column if not exists share_interested boolean not null default true;

comment on column public.fan_preferences.share_interested is
  'When false, friend_activity() omits this fan''s saved (interested) shows. Going and been are always visible to accepted friends (#149).';

-- ---------------------------------------------------------------------------
-- What my friends are up to
-- ---------------------------------------------------------------------------

-- kind: going      = holds an unrefunded ticket, show still to come
--       interested = hearted it (saved_events), show still to come, and the
--                    friend hasn't turned share_interested off
--       been       = scanned in, or marked "I was there" (attended_events),
--                    show already happened
-- Only ACCEPTED friends of the caller, only active uncancelled shows, and an
-- optional event filter so the ticket sheet can ask about one show cheaply.
create or replace function public.friend_activity(p_event_ids uuid[] default null)
returns table (friend_id uuid, event_id uuid, kind text, event_date date)
language sql
security definer
set search_path = public
stable
as $$
  with me as (
    select auth.uid() as id
  ),
  friends as (
    select case when f.user_a = m.id then f.user_b else f.user_a end as id
    from public.friendships f, me m
    where f.status = 'accepted'
      and m.id is not null
      and m.id in (f.user_a, f.user_b)
  ),
  going as (
    select t.user_id as friend_id, t.event_id, 'going'::text as kind
    from public.tickets t
    join friends fr on fr.id = t.user_id
    join public.events e on e.id = t.event_id
    where t.refunded = false
      and t.hidden_at is null
      and e.event_date >= current_date
  ),
  interested as (
    select s.user_id as friend_id, s.event_id, 'interested'::text as kind
    from public.saved_events s
    join friends fr on fr.id = s.user_id
    join public.events e on e.id = s.event_id
    where e.event_date >= current_date
      and coalesce(
        (select p.share_interested from public.fan_preferences p where p.user_id = s.user_id),
        true
      )
  ),
  been as (
    select x.user_id as friend_id, x.event_id, 'been'::text as kind
    from (
      select t.user_id, t.event_id
      from public.tickets t
      join friends fr on fr.id = t.user_id
      where t.checked_in_at is not null
      union
      select a.user_id, a.event_id
      from public.attended_events a
      join friends fr on fr.id = a.user_id
    ) x
    join public.events e on e.id = x.event_id
    where e.event_date < current_date
  ),
  everything as (
    select * from going
    union
    select * from interested
    union
    select * from been
  )
  select u.friend_id, u.event_id, u.kind, e.event_date
  from everything u
  join public.events e on e.id = u.event_id
  where e.active = true
    and e.cancelled = false
    and (p_event_ids is null or u.event_id = any (p_event_ids));
$$;

grant execute on function public.friend_activity(uuid[]) to authenticated;

-- Friends of my friends, ranked by how many of my friends they share. Excludes
-- me, my current friends and anyone I already have a pending row with (either
-- direction). Nobody's full list is exposed: a suggestion carries a count only.
create or replace function public.friend_suggestions(p_limit integer default 10)
returns table (profile_id uuid, mutual_count integer)
language sql
security definer
set search_path = public
stable
as $$
  with me as (
    select auth.uid() as id
  ),
  mine as (
    select case when f.user_a = m.id then f.user_b else f.user_a end as id
    from public.friendships f, me m
    where f.status = 'accepted' and m.id is not null and m.id in (f.user_a, f.user_b)
  ),
  any_row as (
    select case when f.user_a = m.id then f.user_b else f.user_a end as id
    from public.friendships f, me m
    where m.id is not null and m.id in (f.user_a, f.user_b)
  ),
  theirs as (
    select case when f.user_a = mn.id then f.user_b else f.user_a end as id
    from public.friendships f
    join mine mn on mn.id in (f.user_a, f.user_b)
    where f.status = 'accepted'
  )
  select t.id as profile_id, count(*)::integer as mutual_count
  from theirs t, me m
  where t.id <> m.id
    and t.id not in (select id from any_row)
  group by t.id
  order by mutual_count desc, t.id
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

grant execute on function public.friend_suggestions(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

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
    'friend_going'
  )
);

-- "A friend is going to a show you saved" fires once per (you, friend, show)
-- however many seats they buy.
create unique index if not exists notifications_friend_going_once
  on public.notifications (recipient_id, actor_id, event_id)
  where type = 'friend_going';

create or replace function public.notify_on_friend_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (recipient_id, type, actor_id)
  values (
    case when new.requested_by = new.user_a then new.user_b else new.user_a end,
    'friend_request',
    new.requested_by
  );
  return null;
end;
$$;

drop trigger if exists friendships_notify_request on public.friendships;
create trigger friendships_notify_request
  after insert on public.friendships
  for each row execute function public.notify_on_friend_request();

create or replace function public.notify_on_friend_accept()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'pending' and new.status = 'accepted' then
    insert into public.notifications (recipient_id, type, actor_id)
    values (
      new.requested_by,
      'friend_accepted',
      case when new.requested_by = new.user_a then new.user_b else new.user_a end
    );
  end if;
  return null;
end;
$$;

drop trigger if exists friendships_notify_accept on public.friendships;
create trigger friendships_notify_accept
  after update of status on public.friendships
  for each row execute function public.notify_on_friend_accept();

-- A declined or cancelled request takes its "wants to be friends" line with it,
-- so nobody is left with an Accept button on a request that no longer exists.
create or replace function public.clear_friend_request_notification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'pending' then
    delete from public.notifications
      where type = 'friend_request'
        and actor_id = old.requested_by
        and recipient_id = case when old.requested_by = old.user_a then old.user_b else old.user_a end;
  end if;
  return null;
end;
$$;

drop trigger if exists friendships_clear_request on public.friendships;
create trigger friendships_clear_request
  after delete on public.friendships
  for each row execute function public.clear_friend_request_notification();

-- The one activity notification in Phase A: a friend bought a ticket to a show
-- YOU saved. Not every ticket a friend buys - that would turn the bell into
-- noise. Going is always shared, so no share_interested check here.
create or replace function public.notify_friends_going()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.refunded then
    return null;
  end if;
  insert into public.notifications (recipient_id, type, actor_id, event_id)
  select s.user_id, 'friend_going', new.user_id, new.event_id
  from public.saved_events s
  join public.friendships f
    on f.status = 'accepted'
   and f.user_a = least(s.user_id, new.user_id)
   and f.user_b = greatest(s.user_id, new.user_id)
  where s.event_id = new.event_id
    and s.user_id <> new.user_id
  on conflict (recipient_id, actor_id, event_id) where type = 'friend_going' do nothing;
  return null;
end;
$$;

drop trigger if exists tickets_notify_friends on public.tickets;
create trigger tickets_notify_friends
  after insert on public.tickets
  for each row execute function public.notify_friends_going();
