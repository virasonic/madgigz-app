-- Usernames are shown publicly (Explore artist search renders "@username"), so
-- they need to read as handles rather than free text. Two parts: clean up what
-- already exists, then stop new ones getting in.
--
-- The rule is deliberately case-preserving. Existing accounts like "Frejar" and
-- "Kevinteo" are perfectly good handles; the problem being fixed is whitespace,
-- and lowercasing everything would rename real users for no reason.
--
-- Run this in the Supabase SQL editor.

-- 1. Strip whitespace from existing usernames. Today this affects exactly one
--    row ("Hard Fuse" -> "HardFuse"); written generally so it stays correct if
--    more slip in before this runs.
update public.profiles
set username = regexp_replace(username, '\s', '', 'g')
where username ~ '\s';

-- 2. Anything still outside the rule after step 1 would fail the constraint
--    below and abort the whole migration, so surface it rather than guessing at
--    a fix. If this raises, inspect those rows and correct them by hand first.
do $$
declare
  bad_count integer;
  bad_list text;
begin
  select count(*), string_agg(username, ', ')
  into bad_count, bad_list
  from public.profiles
  where username !~ '^[A-Za-z0-9._-]{3,30}$';

  if bad_count > 0 then
    raise exception 'Fix these usernames before adding the constraint: %', bad_list;
  end if;
end $$;

-- 3. Enforce it for real. handle_new_user() copies username straight out of
--    auth signup metadata, so validation in the signup form alone can be
--    bypassed by calling the API directly - this is what actually holds.
alter table public.profiles
  add constraint profiles_username_format
  check (username ~ '^[A-Za-z0-9._-]{3,30}$');
