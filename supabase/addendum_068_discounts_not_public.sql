-- Addendum 068: promo codes are no longer readable from the browser.
--
-- schema.sql gave discounts the policy "Active discounts are viewable by
-- everyone" (using (active = true)) and it was never replaced. With the anon key
-- that is GET /rest/v1/discounts?select=code,value,... - every live code,
-- including 100%-off and comp codes, plus the admin's profile id in created_by.
-- The same "row policy on a table with something private in it" mistake as the
-- two before it (see CLAUDE.md, "RLS is row-level").
--
-- Nothing in the browser needs the table: a code is only ever checked by a
-- server action, which now looks it up with the service role
-- (validateDiscountCode callers in src/app/(app)/checkout-actions.ts).
--
-- THIS IS THE REVOKING HALF OF A TWO-PHASE CHANGE. Run it only AFTER the code
-- that reads discounts via the service role is deployed - against older code it
-- makes every promo code read as "not valid". There is no additive SQL phase;
-- phase one is the deploy itself. STAGING first, then PROD.
--
-- Verify from outside afterwards (should print [] or a permission error):
--   curl -s "$URL/rest/v1/discounts?select=code" -H "apikey: $ANON_KEY"

-- The name is the one schema.sql created; no addendum has renamed it.
drop policy if exists "Active discounts are viewable by everyone" on public.discounts;

revoke all on public.discounts from anon, authenticated;
