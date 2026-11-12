-- #228 follow-up: which platform each user is on and when they were last
-- active, so the Users analyst export can fill its `platform` column and gain a
-- real `last_active_date`. `auth.users.last_sign_in_at` only moves on a fresh
-- login, not on day-to-day use of a session that stays signed in, so it
-- under-reports activity; this is the signal it lacks.
--
-- Deliberately tiny and first-party: ONE row per user, overwritten in place -
-- the platform of their most recent app open and the time of it. No history,
-- no per-session rows, no device ids, no IP. The app touches it once per app
-- open (throttled to once per 6 hours on the device).
--
-- Classification: service-role-only.
--   * RLS on with NO policies, and no table grant for anon/authenticated at all
--     (deny-by-default, the signup_attribution pattern from addendum_050).
--   * The only write path is touch_user_activity() below, security definer,
--     which upserts the CALLER's row (auth.uid()) and nobody else's; the
--     platform is validated against the check constraint's list.
--   * The only reader is /admin/exports (service_role), which emits user_id as
--     a keyed one-way pseudonym, never the raw id.
--   * on delete cascade from profiles: an account purge takes the row with it.
--
-- Safe to run before or after the code deploy: the client touch swallows every
-- error, including "function not found" (42883 / PGRST202) before this runs,
-- and the export treats a missing table as "no data" (platform and
-- last_active_date blank), exactly as it did before.

create table if not exists public.user_activity (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  platform text not null check (platform in ('ios', 'android', 'web')),
  last_active_at timestamptz not null default now()
);

alter table public.user_activity enable row level security;

-- Supabase's default privileges grant anon/authenticated ALL on a new public
-- table; take it away. Even if a permissive policy is added by accident later,
-- there is no table grant for it to act on.
revoke all on public.user_activity from anon, authenticated;

-- The one door that writes it. Upserts the caller's own row; a second call
-- within the same day just moves the timestamp (and the platform, if they
-- switched from the web to the app).
create or replace function public.touch_user_activity(p_platform text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return;
  end if;
  if p_platform not in ('ios', 'android', 'web') then
    return;
  end if;

  insert into public.user_activity (user_id, platform, last_active_at)
  values (uid, p_platform, now())
  on conflict (user_id) do update
    set platform = excluded.platform,
        last_active_at = excluded.last_active_at;
end;
$$;

revoke execute on function public.touch_user_activity(text) from public, anon;
grant execute on function public.touch_user_activity(text) to authenticated;

comment on table public.user_activity is
  'One row per user: platform (ios/android/web) and time of their most recent app open (#228). No history. Written only via touch_user_activity(); read by service_role for the pseudonymous analyst CSV.';
