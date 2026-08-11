-- addendum_032: username_available() must exclude the caller's own profile.
--
-- The bug: the profiles existence check in username_available() (addendum_030)
-- had no "and id <> auth.uid()", unlike complete_onboarding(). For a logged-OUT
-- signup that is correct - the person has no profile row yet. But two logged-IN
-- flows also use it:
--   * the OAuth "complete profile" form - handle_new_user() creates a
--     PLACEHOLDER profile from the user's email at Google sign-in, so when they
--     then type the username they actually want, it collided with their OWN
--     placeholder row and the form said "That username is taken". Real users
--     were forced into names like "FynnDinsdale1".
--   * the username-change form (profile/edit) had the same latent issue.
--
-- complete_onboarding() already excludes the caller (`id <> uid`) so the actual
-- submit would have succeeded - it was only the live availability check that lied.
--
-- Fix: exclude the caller's own row here too. auth.uid() is null for the
-- logged-out signup check, so coalesce to a uuid no real profile has - which
-- excludes nothing, exactly what we want there.
--
-- Pure create-or-replace of a security-definer function, no revoke: safe to run
-- directly on a live database (no two-phase needed).

create or replace function public.username_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    not exists (
      select 1 from public.profiles
      where lower(username) = lower(trim(candidate))
        and id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    )
    and not exists (
      select 1 from public.username_history h
      where lower(h.old_username) = lower(trim(candidate))
        and h.released_at > now() - interval '10 days'
        and h.profile_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    );
$$;

grant execute on function public.username_available(text) to anon, authenticated;
