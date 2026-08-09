-- "HardFuse" and "hardfuse" are the same handle to anyone reading "@username"
-- in Explore search, so only one of them should exist. Capitals stay allowed
-- (addendum_010 is case-preserving on purpose) - this is about collisions.
--
-- Run this in the Supabase SQL editor.

-- 1. Refuse to continue if two rows would collide, rather than letting the
--    index creation fail with a less obvious error.
do $$
declare
  dupes text;
begin
  select string_agg(username, ', ')
  into dupes
  from public.profiles
  where lower(username) in (
    select lower(username) from public.profiles group by lower(username) having count(*) > 1
  );

  if dupes is not null then
    raise exception 'Resolve these colliding usernames first: %', dupes;
  end if;
end $$;

-- 2. The actual guarantee. A pre-check in the signup form can always be beaten
--    by two people submitting at the same moment; this is what makes it true.
create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));

-- 3. Lets the signup form check availability before submitting.
--
--    This exists instead of a PostgREST filter because usernames may contain
--    underscores, and "_" is a single-character wildcard in LIKE/ILIKE - a
--    check for "hard_fuse" would match "hardXfuse" and wrongly report it taken.
--    Comparing inside the function avoids pattern matching entirely.
--
--    No new information is exposed: profiles are already world-readable and
--    usernames are shown publicly in Explore search results.
create or replace function public.username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles where lower(username) = lower(trim(candidate))
  );
$$;

grant execute on function public.username_available(text) to anon, authenticated;
