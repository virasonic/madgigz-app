-- addendum_033: turn on Supabase Realtime for the two things that go stale (#101).
--
-- Nothing in the app is live today - the notifications bell and a show's
-- sold/sold-out count only change on reload. This adds the DB side of pushing
-- those two changes to the browser: the tables have to be members of the
-- `supabase_realtime` publication before Postgres will stream their changes to
-- subscribed clients. Scoped to exactly the two tables that mislead someone
-- when stale (Rauch principle 3), not "realtime everywhere".
--
-- RLS still applies to realtime: a browser only receives a change for a row it
-- is allowed to SELECT. `notifications` is recipient-scoped
-- (addendum_022: "auth.uid() = recipient_id"), so a fan only ever hears about
-- their own bell; `events` is publicly readable, which is what we want for a
-- live sold count. So this publication membership grants no new read access -
-- it only decides which tables emit a realtime stream at all.
--
-- Safe to run on a live database: it adds tables to a publication and sets
-- replica identity. No revoke, no data change, so no two-phase needed.
--
-- Run this in the Supabase SQL editor (staging first, then prod).

-- The publication ships with every Supabase project (usually empty). Create it
-- defensively in case a bare Postgres is ever used, then add our two tables
-- only if they aren't already members - re-adding an existing member errors,
-- so this stays idempotent and can be re-run without failing.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'events'
  ) then
    alter publication supabase_realtime add table public.events;
  end if;
end $$;

-- Why REPLICA IDENTITY FULL on notifications: the bell subscribes with the
-- filter `recipient_id=eq.<me>`. On INSERT/UPDATE the whole new row is in the
-- stream so the filter matches fine, but on DELETE only the replica-identity
-- columns are sent - by default just the primary key, which has no
-- recipient_id, so a "notification deleted" event would never reach the right
-- client. FULL puts every column in the DELETE payload so the per-user filter
-- still matches. Low write volume here, so the extra WAL is negligible.
alter table public.notifications replica identity full;

-- events is filtered by `id=eq.<event>` (the primary key), which is present in
-- the default replica identity for every operation we care about (we only ever
-- react to the sold count changing, i.e. UPDATE), so it needs no change.
