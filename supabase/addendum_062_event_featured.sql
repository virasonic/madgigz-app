-- #217: a featured show, pinned to the top of Explore.
--
-- One boolean on events. No new table: "featured" is a property of the show,
-- and the list of featured shows is just the rows where it is true.
--
-- GRANTS: deliberately none. events.select is table-level (the "Events are
-- viewable by everyone" policy), so the new column is readable by anon and
-- authenticated the moment it exists - that is what Explore needs. UPDATE is
-- the opposite: addendum_026 revoked update on events and granted back only
-- (active) to authenticated, and Postgres does not extend a column grant to
-- columns added later. So an artist cannot feature their own show, which is
-- the point - featuring is an editorial decision. The admin panel writes it
-- through service_role, which column grants never constrain.
--
-- Safe to run before the code deploy: every reader is `featured ?? false`.

alter table public.events
  add column if not exists featured boolean not null default false;

-- Explore reads "the featured ones" out of a table that is almost entirely
-- not-featured, so a partial index stays tiny.
create index if not exists events_featured_idx
  on public.events (featured)
  where featured;

comment on column public.events.featured is
  'Editorially pinned to the top of Explore (#217). Admin-only: no column-level update grant, so only service_role writes it.';
