-- #88, part 3: a promoter or venue has a public profile, can be followed, and
-- their followers hear about their shows.
--
-- Vir, 20 Sept 2026: "promoters could get a good rep too." Reputation needs a
-- page worth visiting and a way to follow it, which today they have neither of.
--
-- THE PROBLEM. `pro_accounts` is deliberately private — addendum_051's policy
-- lets you read exactly one row, your own. That is right for a control table
-- (it carries `active`, which decides who reaches the panel), but it means a fan
-- looking at a promoter's profile cannot tell that this account HAS a public
-- page. The private table can't answer a public question.
--
-- THE FIX is the shape addendum_017 already established with
-- `stripe_account_connected`: a public, granted mirror column on `profiles`
-- carrying only the part everyone may see, kept in step by a trigger so it
-- cannot drift from the private source. `profiles.pro_type` says "this account
-- is a promoter / a venue / neither", and nothing else — no venue, no
-- created_by, no `active` flag to read sideways, because a deactivated account
-- simply reads as null, i.e. not a pro at all. Losing the public page is part of
-- what deactivation should mean.
--
-- `follows` needs no change: it was always profile → profile (addendum_021) with
-- no restriction on who may be followed, and `follower_count` is maintained by
-- its own trigger for any profile. Only discoverability was missing.
--
-- SAFE TO RUN ON A LIVE DB — additive, with one `create or replace` on an
-- existing function whose old behaviour is preserved exactly (see section 3).
-- Code that ships before it degrades: pro_type reads as undefined, so a promoter
-- simply has no public page yet, and followers of one get no show notification.
--
-- REQUIRES addendum_051. Run in the Supabase SQL editor: STAGING first, PROD
-- after.

-- ============ 1. The public mirror of "is this a pro account" ============

alter table public.profiles
  add column if not exists pro_type pro_account_type;

comment on column public.profiles.pro_type is
  'Public mirror of pro_accounts.type for an ACTIVE account, null otherwise (#88). Maintained by trigger — never write it directly. Exists because pro_accounts is private and "does this profile have a public page" is a public question.';

-- THE RULE FROM CLAUDE.md: profiles has column-level grants, and a column added
-- later is NOT granted automatically. Without this the page would read pro_type
-- as null for everybody and promoters would silently have no profile — the
-- mysteriously-empty-field failure, which fails closed but is easy to miss.
grant select (pro_type) on public.profiles to anon, authenticated;

-- Not granted for UPDATE to anyone: it is derived, and the trigger owns it.

-- ============ 2. Keeping it in step, in the database ============

-- A trigger rather than an application write, for the same reason
-- sync_follower_count is one: there is more than one path that changes a pro
-- account (the admin panel creates, the deactivate button updates, a cascade
-- deletes), and a mirror maintained by whichever caller remembered is a mirror
-- that drifts.
create or replace function public.sync_profile_pro_type()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.profiles set pro_type = null where id = old.id;
    return old;
  end if;

  -- Deactivating takes the public page away too, which is the intent: an
  -- account MadGigz has switched off should stop being findable, not merely
  -- stop being able to sign in to the panel.
  update public.profiles
  set pro_type = case when new.active then new.type else null end
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists pro_accounts_sync_profile_pro_type on public.pro_accounts;
create trigger pro_accounts_sync_profile_pro_type
  after insert or update or delete on public.pro_accounts
  for each row execute function public.sync_profile_pro_type();

-- Backfill whatever already exists, so the mirror starts true rather than
-- becoming true only on the next edit.
update public.profiles p
set pro_type = case when pa.active then pa.type else null end
from public.pro_accounts pa
where pa.id = p.id
  and p.pro_type is distinct from (case when pa.active then pa.type else null end);

-- ============ 3. Followers hear about a promoter's shows ============

-- The existing function returns early when artist_id is null, which is every
-- show a promoter books — so following one would have been a button that did
-- nothing.
--
-- The ONLY change is that the organiser is now `coalesce(artist_id,
-- pro_account_id)` instead of `artist_id`. Every other line, including the
-- UPDATE guard that stops an un-hide re-notifying and the duplicate check, is
-- carried over verbatim from addendum_022. A show with neither owner (a MadGigz
-- house show) still returns early, exactly as before, because coalesce of two
-- nulls is null.
create or replace function public.notify_followers_of_show()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  organiser uuid := coalesce(new.artist_id, new.pro_account_id);
begin
  if organiser is null or new.active is not true or new.cancelled then
    return null;
  end if;

  if tg_op = 'UPDATE' and old.active is true then
    return null;
  end if;

  insert into public.notifications (recipient_id, type, event_id, actor_id)
  select f.follower_id, 'followed_artist_show', new.id, organiser
  from public.follows f
  where f.artist_id = organiser
  -- Belt and braces: the unique index doesn't cover this type, so guard against
  -- an update path sending a second copy.
  and not exists (
    select 1 from public.notifications n
    where n.recipient_id = f.follower_id
      and n.event_id = new.id
      and n.type = 'followed_artist_show'
  );
  return null;
end;
$$;

-- The trigger itself is unchanged and does not need recreating: `create or
-- replace function` swaps the body under it. Left here as a no-op safety net in
-- case this file is ever run against a database that never had addendum_022.
drop trigger if exists events_notify_followers on public.events;
create trigger events_notify_followers
  after insert or update of active on public.events
  for each row execute function public.notify_followers_of_show();
