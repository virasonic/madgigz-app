-- Step 2 of 2. Run this only AFTER addendum_017 and after the app code that
-- accompanies it is deployed. Running it early breaks checkout and payout
-- onboarding, because the code shipping before it still reads
-- stripe_account_id through the user's own client.
--
-- RLS picks rows; GRANTs pick columns. The two are complementary, and this is
-- the missing half. The row policy ("Profiles are viewable by everyone") stays
-- exactly as it is - browsing an artist's public page still works. What changes
-- is that two columns are no longer part of "the row" as far as anon and
-- authenticated are concerned.
--
-- service_role keeps its own grants untouched, so the admin panel is unaffected.

revoke select on public.profiles from anon, authenticated;

-- Everything a fan, an artist, or a logged-out visitor may ever see.
-- Deliberately omitted:
--   date_of_birth     - personal data, collected for the 16+ age gate and read
--                       by nothing in the app. It should never have been public.
--   stripe_account_id - replaced for UI purposes by stripe_account_connected
--                       (addendum_017). Server code reads the real id through
--                       the service-role client instead.
grant select (
  id,
  username,
  role,
  artist_name,
  artist_bio,
  artist_photo_url,
  instagram,
  tiktok,
  twitter,
  spotify,
  youtube,
  artist_status,
  evidence_submitted,
  stripe_payouts_ready,
  stripe_account_connected,
  created_at
) on public.profiles to anon, authenticated;

-- !! Once a table has column-level grants, columns added later are NOT granted
-- automatically. Any future migration that adds a publicly-readable column to
-- profiles must add it to a grant here too, or the app will start getting 403s
-- on it. That fails closed rather than open, which is the right direction, but
-- it is easy to forget - hence this shouting comment.
