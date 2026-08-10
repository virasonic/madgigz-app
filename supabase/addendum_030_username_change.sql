-- Backlog #89 + #91: let people change their username, and sign in with it.
--
-- These are one feature. A username you can change is a public handle; a
-- username you can sign in with is a credential; and the moment it is both,
-- "what happens to the old name" has to be answered once for both. Vir decided
-- it on 9 Aug 2026: a released username is held for 10 days before anyone else
-- can claim it, so it can't be grabbed the instant an artist changes handles.
--
-- Run this in the Supabase SQL editor.

-- ============ 1. The history of released names ============

create table if not exists public.username_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  old_username text not null,
  released_at timestamptz not null default now()
);

-- The only read pattern is "is this name held, and by whom, in the last N days".
create index if not exists username_history_lookup
  on public.username_history (lower(old_username), released_at desc);

alter table public.username_history enable row level security;
-- No policies at all: only the security-definer functions below touch it, and
-- they run as the definer. Nobody queries this table directly from the app -
-- it would leak the previous handles of every account otherwise.

-- ============ 2. Availability now respects the cooldown ============

-- Replaces addendum_011's version. A name is available when nobody holds it
-- AND it wasn't released by SOMEONE ELSE within the last 10 days. "Someone
-- else" matters: you can always reclaim a handle you just released yourself.
create or replace function public.username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not exists (
      select 1 from public.profiles where lower(username) = lower(trim(candidate))
    )
    and not exists (
      select 1 from public.username_history h
      where lower(h.old_username) = lower(trim(candidate))
        and h.released_at > now() - interval '10 days'
        -- auth.uid() is null for a logged-out signup check, so coalesce to a
        -- value no real profile has: the cooldown then applies to everyone.
        and h.profile_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    );
$$;

grant execute on function public.username_available(text) to anon, authenticated;

-- ============ 3. The rename itself ============

-- Client code cannot UPDATE profiles.username directly - addendum_024 revoked
-- that. This is the single door, and it enforces every rule server-side:
-- format, the release cooldown, and recording the old name so the cooldown can
-- see it. Returns a status string so the form can put the message on the field.
create or replace function public.change_username(p_new text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  current_name text;
  clean text := trim(coalesce(p_new, ''));
begin
  if uid is null then
    return 'not_signed_in';
  end if;

  select username into current_name from public.profiles where id = uid;
  if current_name is null then
    return 'no_profile';
  end if;

  -- A pure case change ("van" -> "Van") is allowed and not a "release": the
  -- handle is the same to everyone reading it, so it skips the history record.
  if lower(clean) = lower(current_name) then
    if clean = current_name then
      return 'unchanged';
    end if;
    update public.profiles set username = clean where id = uid;
    return 'ok';
  end if;

  if clean !~ '^[A-Za-z0-9._-]{3,30}$' then
    return 'invalid';
  end if;

  if not public.username_available(clean) then
    return 'taken';
  end if;

  -- Record the name being left behind, then take the new one. The order
  -- matters: the history row is what holds the old name for 10 days.
  insert into public.username_history (profile_id, old_username)
  values (uid, current_name);

  update public.profiles set username = clean where id = uid;
  return 'ok';
exception
  -- Two people racing for the same free name; the unique index decides it.
  when unique_violation then
    return 'taken';
end;
$$;

revoke execute on function public.change_username(text) from public, anon;
grant execute on function public.change_username(text) to authenticated;

-- ============ 4. Username -> email, for sign-in ============

-- Supabase Auth only authenticates on email. This resolves a username to the
-- address so a server action can sign the person in - it is NEVER granted to
-- anon or authenticated, so the browser cannot call it to harvest emails. Only
-- the service-role client (server-side, behind the sign-in action) may.
create or replace function public.email_for_username(candidate text)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.email
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(p.username) = lower(trim(candidate))
  limit 1;
$$;

revoke execute on function public.email_for_username(text) from public, anon, authenticated;
grant execute on function public.email_for_username(text) to service_role;
