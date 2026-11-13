-- Addendum 067: close two holes found in the Nov 2026 security review.
--
-- 1. SIGNUP COULD MINT AN ADMIN. handle_new_user() (last defined in
--    addendum_025) cast raw_user_meta_data->>'role' straight to user_role. That
--    metadata is whatever the client sends to /auth/v1/signup, and the anon key
--    ships in the browser - so a signup carrying {"role":"admin"} (or "analyst",
--    since addendum_065) produced a profile with that role. requireAdmin() and
--    every "role = 'admin'" policy trust that column. addendum_024 stopped role
--    changes by UPDATE and addendum_025 capped complete_onboarding at
--    fan/artist, but the INSERT path was never capped.
--
--    Now only 'artist' is honoured from metadata; anything else is a fan. Admin
--    and analyst are granted by hand (service role), never by signing up.
--
-- 2. attended_event(p_user, p_event) WAS A PUBLIC ATTENDANCE ORACLE. It is
--    security definer (it has to read owner-only tickets/attended_events from
--    inside the fan_photos insert policy) but trusted p_user and was executable
--    by anon, so anyone could ask "was this person at this show?" for any
--    profile id. The policy only ever passes auth.uid(), so the function now
--    answers for the caller alone and anon can no longer call it.
--
-- SAFE TO RUN ON A LIVE DB, single phase: both are create-or-replace with the
-- same signature, nothing the deployed app does changes. Run on STAGING first,
-- then PROD.
--
-- AFTER RUNNING, AUDIT BOTH DATABASES - this should list only accounts you
-- recognise:
--   select id, username, role, created_at from public.profiles
--    where role in ('admin', 'analyst') order by created_at;

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
  -- Client-controlled, so an allow-list rather than a cast: 'artist' is the
  -- only role a signup may ask for, and it lands in the review queue below.
  final_role user_role := case when meta_role = 'artist' then 'artist'::user_role
                               else 'fan'::user_role end;
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

create or replace function public.attended_event(p_user uuid, p_event uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select p_user = auth.uid()
     and exists (select 1 from public.events e where e.id = p_event and e.event_date < current_date)
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

revoke execute on function public.attended_event(uuid, uuid) from public, anon;
grant execute on function public.attended_event(uuid, uuid) to authenticated;
