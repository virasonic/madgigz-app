-- Closes a live privilege escalation on public.profiles.
--
-- "Users can update own profile" (schema.sql) is:
--
--   for update using (auth.uid() = id)
--
-- which correctly stops you editing someone else's row, and says nothing at all
-- about WHICH COLUMNS you may edit on your own. Verified against the real API
-- on 10 Aug 2026 with a throwaway account: an ordinary signed-in fan could set
--
--   role              -> 'artist'      (skips the whole verification gate)
--   artist_status     -> 'approved'    (ditto, and then they can publish shows)
--   date_of_birth     -> '2020-01-01'  (defeats the 16+ age gate after signup)
--   stripe_payouts_ready -> true
--   stripe_account_id -> anything
--
-- This is the third instance of the same mistake in this project, and the exact
-- thing CLAUDE.md warns about: RLS picks ROWS, GRANTs pick COLUMNS. addendum_018
-- fixed the read half of this table. This is the write half.
--
-- Nothing server-side is affected: payout-actions.ts, account-actions.ts,
-- admin/actions.ts, the Stripe webhook and lib/account-deletion.ts all write
-- through the service-role client, which these grants do not touch.
--
-- Run this in the Supabase SQL editor.

revoke update on public.profiles from anon, authenticated;

-- Everything a person may legitimately change about themselves from the app.
-- These are the columns the two client-side writers actually set:
-- (onboarding)/signup/artist-profile/page.tsx and (app)/profile/edit/page.tsx.
--
-- Deliberately omitted, and why:
--   id, created_at        - identity. Never.
--   username              - a public handle; changing it is [[89]], which has
--                           rules (a 10-day cooldown) that a raw UPDATE cannot
--                           enforce. Until then it is set once, at signup.
--   role, artist_status   - the artist verification gate. Only an admin, or
--                           complete_onboarding() at signup, may set these.
--   date_of_birth         - the 16+ gate. Set once at signup and never edited,
--                           which is also why it is not readable (addendum_018).
--   stripe_account_id,
--   stripe_payouts_ready  - payout routing. Written only by payout-actions.ts
--                           and the account.updated webhook, both service-role.
--   follower_count        - maintained by the sync_follower_count() trigger.
--   deletion_requested_at,
--   deleted_at            - the deletion grace period. Server-side only, or
--                           someone could quietly un-schedule their own purge.
grant update (
  artist_name,
  artist_bio,
  artist_photo_url,
  instagram,
  tiktok,
  twitter,
  spotify,
  youtube,
  evidence_submitted
) on public.profiles to authenticated;

-- The policy had no WITH CHECK, so the USING clause was doing double duty. With
-- column grants in place that no longer matters much, but state it explicitly
-- rather than relying on the fallback.
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Same warning as addendum_018, now for the other verb: once a table has
-- column-level UPDATE grants, columns added later are NOT granted. A new
-- user-editable profile field needs adding to the list above, or saving it
-- fails with 42501.
