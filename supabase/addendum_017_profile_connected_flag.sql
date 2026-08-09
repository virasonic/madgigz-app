-- Step 1 of 2. Run this one NOW - it is purely additive and breaks nothing.
-- Step 2 (addendum_018) is the part that actually closes the hole, and must be
-- run only AFTER the matching app code is deployed. See the note at the bottom.
--
-- Background: profiles has "select using (true)", which is a ROW policy. It
-- grants the whole row, so date_of_birth and stripe_account_id are readable by
-- anyone holding the anon key - and the anon key ships in the browser bundle,
-- so that means anyone at all. Verified with a plain curl against /rest/v1.
--
-- The app code was never the problem: every query that reads someone else's
-- profile already selects an explicit, safe column list. The hole is the REST
-- API underneath it.

-- The artist Settings sheet shows three payout states - not connected, connected
-- but unverified, and ready - so it needs to know whether an account exists.
-- It never needs the account id itself (the only use is Boolean(...)), so
-- expose exactly the boolean and nothing more. Generated + stored, so it can
-- never drift out of sync with the column it mirrors.
alter table public.profiles
  add column if not exists stripe_account_connected boolean
  generated always as (stripe_account_id is not null) stored;

-- No grant needed here: the blanket table-level SELECT that already exists
-- covers this new column. addendum_018 replaces that blanket grant with an
-- explicit list, and includes this column in it.
