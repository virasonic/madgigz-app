-- Groundwork for Google (and later Apple) sign-in.
--
-- The problem: handle_new_user() reads username, role and date_of_birth out of
-- raw_user_meta_data, which the signup form fills in. An OAuth callback carries
-- none of them - Google sends name, email and a picture. Left as it was, a
-- Google signup would have produced a profile with
--
--   username      = the email's local part, which may be >30 chars, may contain
--                   '+' and may already be taken - any of which violates
--                   addendum_010's format check or addendum_011's unique index
--                   and fails the whole signup with "Database error saving new
--                   user"
--   date_of_birth = null, silently skipping the 16+ age gate
--   role          = 'fan', with no way for an artist to say otherwise
--
-- So: the trigger learns to cope with missing metadata by parking the account
-- in an incomplete state, and a post-callback screen collects the three real
-- answers through complete_onboarding() below.
--
-- Run this in the Supabase SQL editor, AFTER addendum_024.

-- ============ 1. The incomplete flag ============

-- Defaults to true so every existing account is untouched. Only the trigger
-- below ever sets it false, and only when the metadata isn't there.
alter table public.profiles
  add column if not exists onboarding_complete boolean not null default true;

-- Column-level grants mean new columns are NOT granted automatically
-- (addendum_018). Read-only, and only for signed-in users - a logged-out
-- visitor browsing an artist page has no business knowing this.
grant select (onboarding_complete) on public.profiles to authenticated;

-- ============ 2. A trigger that survives missing metadata ============

-- Picks a username that is guaranteed to satisfy addendum_010's format check
-- and addendum_011's unique index, so an OAuth signup can never fail on it.
-- This is a placeholder: the completion screen immediately asks the person what
-- they actually want to be called, and complete_onboarding() overwrites it.
create or replace function public.placeholder_username(email text)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  base text;
  candidate text;
  attempts int := 0;
begin
  -- Strip anything the format check would reject, including the '+' in
  -- "someone+tag@gmail.com", and leave room for a numeric suffix.
  base := left(regexp_replace(split_part(coalesce(email, ''), '@', 1), '[^A-Za-z0-9._-]', '', 'g'), 20);
  if length(base) < 3 then
    base := 'gigzfan';
  end if;

  candidate := base;
  while exists (select 1 from public.profiles where lower(username) = lower(candidate)) loop
    attempts := attempts + 1;
    -- After a few collisions stop guessing politely and take a uuid slice; the
    -- loop must terminate even if someone has claimed every base+NNNN.
    if attempts > 20 then
      return left('gigz' || replace(gen_random_uuid()::text, '-', ''), 30);
    end if;
    candidate := base || floor(random() * 10000)::int::text;
  end loop;

  return candidate;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  meta_username text := new.raw_user_meta_data->>'username';
  meta_role text := new.raw_user_meta_data->>'role';
  meta_dob date := nullif(new.raw_user_meta_data->>'date_of_birth', '')::date;
  -- The email/password form always sends a username. An OAuth provider never
  -- does, and that absence is the only reliable signal we have here.
  is_oauth boolean := meta_username is null;
  final_role user_role := coalesce(meta_role::user_role, 'fan');
begin
  insert into public.profiles (
    id, username, role, date_of_birth, artist_status, onboarding_complete
  )
  values (
    new.id,
    coalesce(meta_username, public.placeholder_username(new.email)),
    final_role,
    meta_dob,
    case when final_role = 'artist' then 'pending'::artist_status else null end,
    not is_oauth
  );
  return new;
end;
$$;

-- ============ 3. The one place role and date_of_birth may be set ============

-- addendum_024 took role, date_of_birth and username away from the client, so
-- the completion screen cannot simply UPDATE its own row - which is the point.
-- This is the narrow, single-use door instead: it only works while the profile
-- is incomplete, and it enforces the same rules the signup form does, on the
-- server, where they cannot be skipped by talking to the API directly.
--
-- Returns a status code rather than raising, so the screen can put the message
-- under the right field instead of showing a Postgres error.
create or replace function public.complete_onboarding(
  p_username text,
  p_role text,
  p_date_of_birth date
)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  is_complete boolean;
  clean text := trim(coalesce(p_username, ''));
begin
  if uid is null then
    return 'not_signed_in';
  end if;

  select onboarding_complete into is_complete from public.profiles where id = uid;
  if is_complete is null then
    return 'no_profile';
  end if;
  -- Single use. Without this the RPC would be a permanent bypass of every rule
  -- addendum_024 just imposed - change your role to artist whenever you like.
  if is_complete then
    return 'already_complete';
  end if;

  if p_role not in ('fan', 'artist') then
    return 'bad_role';
  end if;
  -- Same pattern as addendum_010 and the signup form.
  if clean !~ '^[A-Za-z0-9._-]{3,30}$' then
    return 'username_invalid';
  end if;
  if p_date_of_birth is null then
    return 'dob_required';
  end if;
  -- The 16+ gate, enforced somewhere it actually holds. Until now it lived only
  -- in the signup form's JavaScript.
  if p_date_of_birth > (current_date - interval '16 years')::date then
    return 'too_young';
  end if;
  if exists (
    select 1 from public.profiles where lower(username) = lower(clean) and id <> uid
  ) then
    return 'username_taken';
  end if;

  update public.profiles set
    username = clean,
    role = p_role::user_role,
    date_of_birth = p_date_of_birth,
    -- An artist arriving through Google is as unverified as one arriving
    -- through the form: they land in the same review queue.
    artist_status = case when p_role = 'artist' then 'pending'::artist_status else null end,
    onboarding_complete = true
  where id = uid;

  return 'ok';
exception
  -- Two people can pass the check above in the same instant; addendum_011's
  -- unique index is what actually decides it.
  when unique_violation then
    return 'username_taken';
end;
$$;

revoke execute on function public.complete_onboarding(text, text, date) from public, anon;
grant execute on function public.complete_onboarding(text, text, date) to authenticated;
