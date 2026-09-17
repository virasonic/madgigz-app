-- addendum_050: where a signup came from (ad attribution)
--
-- The Meta campaign went live 16 Sep 2026 and nothing recorded which ad a
-- signup came from, so spend could not be tied to accounts. This stores the
-- `utm_*` / `fbclid` the browser arrived with, once, at the moment onboarding
-- completes.
--
-- Deliberately a separate table rather than columns on `profiles`:
--   * `profiles` carries public columns with column-level GRANTs (addendum_018)
--     and a permissive row policy. Marketing attribution is service-role-only
--     data - the category CLAUDE.md says must not sit on a table anyone can
--     select a row from.
--   * It is write-once per user, so a client cannot rewrite its own source
--     later to look like it came from a different campaign.
--
-- Run on STAGING first, then prod. The app degrades gracefully in the gap:
-- `recordSignupAttribution()` swallows 42883 (function missing) so signup keeps
-- working before this is applied.

-- ============================ 1. The table ==================================

create table if not exists public.signup_attribution (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  source text,
  medium text,
  campaign text,
  content text,
  term text,
  -- Meta's click id. Kept because it is the join key if we ever send server-side
  -- conversions back to Meta (Conversions API), and because it identifies paid
  -- Meta traffic even when the utm_* tags are stripped by a client.
  fbclid text,
  landing_path text,
  referrer text,
  created_at timestamptz not null default now()
);

-- RLS on with **no policies at all**: deny-by-default. Nothing here is readable
-- or writable with the anon key, from any session. Writes arrive through the
-- security-definer function below; reads are admin (service_role), which RLS
-- does not apply to.
alter table public.signup_attribution enable row level security;

-- Belt and braces: even if a future migration adds a permissive policy by
-- accident, there is no table grant for it to act on.
revoke all on public.signup_attribution from anon, authenticated;

create index if not exists signup_attribution_campaign_idx
  on public.signup_attribution (campaign, created_at desc);

-- ===================== 2. The one door that writes it =======================

-- Takes the whole thing as jsonb so the client cannot pass positional arguments
-- in the wrong order, and so adding a field later does not change the
-- signature (which would need a new grant).
--
-- Returns a status code rather than raising: attribution failing must never
-- break a signup, and the caller ignores the result anyway.
create or replace function public.record_signup_attribution(p_attribution jsonb)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return 'not_signed_in';
  end if;

  -- Every value is trimmed, capped at 200 chars and emptied to null in one
  -- place. These arrive from a URL the visitor controls, so without a cap this
  -- would be an unbounded write primitive for any signed-in user.
  with v as (
    select
      nullif(left(trim(coalesce(p_attribution ->> 'source', '')), 200), '')       as source,
      nullif(left(trim(coalesce(p_attribution ->> 'medium', '')), 200), '')       as medium,
      nullif(left(trim(coalesce(p_attribution ->> 'campaign', '')), 200), '')     as campaign,
      nullif(left(trim(coalesce(p_attribution ->> 'content', '')), 200), '')      as content,
      nullif(left(trim(coalesce(p_attribution ->> 'term', '')), 200), '')         as term,
      nullif(left(trim(coalesce(p_attribution ->> 'fbclid', '')), 200), '')       as fbclid,
      nullif(left(trim(coalesce(p_attribution ->> 'landing_path', '')), 200), '') as landing_path,
      nullif(left(trim(coalesce(p_attribution ->> 'referrer', '')), 200), '')     as referrer
  )
  insert into public.signup_attribution (
    user_id, source, medium, campaign, content, term, fbclid, landing_path, referrer
  )
  select uid, v.source, v.medium, v.campaign, v.content, v.term, v.fbclid,
         v.landing_path, v.referrer
  from v
  -- Write-once. A second call is a no-op, not an overwrite.
  on conflict (user_id) do nothing;

  return 'ok';
end;
$$;

revoke execute on function public.record_signup_attribution(jsonb) from public, anon;
grant execute on function public.record_signup_attribution(jsonb) to authenticated;

-- ======================= 3. Reading it (admin / SQL) ========================
--
-- Signups per campaign, newest first:
--
--   select coalesce(campaign, '(direct)') as campaign,
--          coalesce(source, '(none)')     as source,
--          coalesce(content, '(none)')    as ad,
--          count(*)                       as signups,
--          min(created_at)                as first_signup,
--          max(created_at)                as last_signup
--   from public.signup_attribution
--   group by 1, 2, 3
--   order by signups desc;
--
-- Did they become artists, and did they ever sell?
--
--   select a.campaign, p.role, count(*)
--   from public.signup_attribution a
--   join public.profiles p on p.id = a.user_id
--   group by 1, 2
--   order by 1, 2;
