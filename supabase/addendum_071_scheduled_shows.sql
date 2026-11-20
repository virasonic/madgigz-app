-- Addendum 071: schedule a gig post - build the show now, publish it at a set
-- time (#204).
--
-- A scheduled show is an ordinary events row that is inserted HIDDEN
-- (active = false) with a `publish_at` timestamp. Every fan surface already
-- filters on active (Explore, the feed, the public /e/ page, the sitemap, the
-- follower-notification trigger), so nothing new has to learn to hide it. At
-- publish_at a pg_cron job inside the database flips active to true, and the
-- existing events_notify_followers trigger (addendum_022/053) fires on that
-- false -> true transition exactly as it does when an organiser un-hides a show
-- - so "notify followers at publish time" costs nothing extra.
--
-- Invariant: publish_at IS NOT NULL  <=>  the show is scheduled and pending.
-- The moment a show goes live - by the cron job, or by the organiser pressing
-- "Publish now" (the same active toggle they already have) - the trigger below
-- clears publish_at. That is what stops the job re-publishing a show the
-- organiser later hides by hand: once published, there is no pending time to
-- match.
--
-- Why pg_cron and not a Vercel cron: the app's Vercel cron runs once a day
-- (vercel.json), which is useless for "go live at 20:00". pg_cron runs every
-- minute, inside the DB, as the postgres role (bypasses RLS), with no worker to
-- keep alive. If the job is ever late, the failure mode is "published late",
-- never "leaked early".
--
-- CLASSIFICATION of publish_at: public. A pending show is already invisible by
-- active = false (same exposure as an organiser-hidden show today); once live
-- the column is null. Organisers get INSERT on it (the artist Add Show form is
-- a browser insert) but no UPDATE grant: the only way out of "scheduled" is the
-- active toggle, which the trigger turns into publish_at = null.
--
-- REQUIRES addendum_069 (events.admin_hidden). SAFE ON A LIVE DB - additive:
-- one nullable column, two column grants, one trigger, one function, one cron
-- job. Nothing is revoked. Code degrades until this runs: a plain (unscheduled)
-- show never sends the column; a scheduled one reports "run addendum_071".
--
-- Run order: enable pg_cron in the dashboard (see section 4), then STAGING
-- first, then PROD. Every statement is re-runnable.
-- Verify: (1) as an artist, add a show scheduled 3 minutes out -> it shows on
-- your profile as "Scheduled", not in Explore; (2) wait -> it appears in
-- Explore and a follower gets the "new show" notification; (3)
--   select jobname, schedule, active from cron.job;
-- lists publish-scheduled-shows; (4) select * from cron.job_run_details order
-- by start_time desc limit 5; shows it running clean.

-- ============ 1. The column ============

alter table public.events
  add column if not exists publish_at timestamptz;

comment on column public.events.publish_at is
  'When a scheduled show goes live (#204). Non-null = scheduled and still pending; cleared by apply_show_schedule() the moment it publishes (addendum_071).';

-- The artist form inserts straight from the browser (column-granted since
-- addendum_026), so it needs these two to create a show hidden-with-a-time.
-- Inserting active = false is harmless: it is the same hidden show the update
-- grant on `active` already lets them make a moment later.
grant insert (active, publish_at) on public.events to authenticated;

-- ============ 2. Keep publish_at and active consistent ============

-- BEFORE INSERT OR UPDATE. Fires before events_guard_reactivation (069) by
-- name order, and only ever touches publish_at/active in the directions below:
--   * a row arriving with a future publish_at is forced hidden, whatever the
--     client said - the schedule is honoured even if a form forgets active;
--   * a publish_at already in the past means "publish now": nulled, left live;
--   * active going false -> true (cron, or an organiser's "Publish now")
--     clears publish_at, so a later manual hide is a plain hide.
create or replace function public.apply_show_schedule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.publish_at is not null then
      if new.publish_at > now() then
        new.active := false;
      else
        new.publish_at := null;
      end if;
    end if;
    return new;
  end if;

  -- UPDATE
  if new.publish_at is distinct from old.publish_at and new.publish_at is not null then
    if new.publish_at > now() then
      new.active := false;
    else
      new.publish_at := null;
      new.active := true;
    end if;
    return new;
  end if;

  if coalesce(old.active, true) = false and coalesce(new.active, true) = true then
    new.publish_at := null;
  end if;

  return new;
end;
$$;

revoke execute on function public.apply_show_schedule() from public, anon, authenticated;

drop trigger if exists events_apply_schedule on public.events;
create trigger events_apply_schedule
  before insert or update on public.events
  for each row
  execute function public.apply_show_schedule();

-- ============ 3. The publish job ============

-- Flips every due show live. The update runs the two triggers above: ours
-- clears publish_at, 069's guard passes (no auth.uid() for a cron/service
-- caller), and events_notify_followers sends the "new show" notification to
-- followers. A cancelled or MadGigz-hidden show never publishes; its stale
-- publish_at is cleared so it stops matching.
create or replace function public.publish_due_shows()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  published integer;
begin
  update public.events
     set publish_at = null
   where publish_at is not null
     and publish_at <= now()
     and (cancelled or admin_hidden);

  with flipped as (
    update public.events
       set active = true
     where publish_at is not null
       and publish_at <= now()
       and active = false
       and not cancelled
       and not admin_hidden
    returning id
  )
  select count(*) into published from flipped;

  return published;
end;
$$;

revoke execute on function public.publish_due_shows() from public, anon, authenticated;
grant execute on function public.publish_due_shows() to service_role;

-- ============ 4. Run it every minute ============

-- pg_cron must be enabled FROM THE DASHBOARD first: Integrations -> Cron ->
-- Enable (or Database -> Extensions -> pg_cron). NOT from here: `create
-- extension pg_cron` run in the SQL editor makes `postgres` the extension's
-- owner, and Supabase's own post-create hook then fails with
-- "2BP01: dependent privileges exist" trying to revoke from that owner (seen
-- on staging, 20 Nov 2026). The dashboard creates it as supabase_admin, which
-- is what the hook expects. This block refuses to continue until that's done.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron is not enabled. Supabase dashboard -> Integrations -> Cron -> Enable, then re-run this file (it is safe to re-run).';
  end if;
end
$$;

-- Re-runnable: drop the job if it is already there, then schedule it.
-- (cron.unschedule errors on an unknown name, hence the where.)
select cron.unschedule(jobid) from cron.job where jobname = 'publish-scheduled-shows';
select cron.schedule('publish-scheduled-shows', '* * * * *', $$select public.publish_due_shows()$$);
