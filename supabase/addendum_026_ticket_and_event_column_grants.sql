-- The same mistake as addendum_024, now on tickets and events: a row policy
-- decides WHICH ROWS you may write, and nothing decides WHICH COLUMNS.
--
-- Found by scripts/security-probe.mjs on 10 Aug 2026, running as ordinary
-- signed-in users against the live database. Fans came out clean - there is no
-- fan UPDATE policy on tickets at all, so a ticket holder cannot touch their own
-- ticket. The holes are on the artist side, where a policy does exist:
--
--   "Artists can check in tickets for their own events"
--      for update using (<the event is mine>)
--
--   was named for checking in, and grants everything. An artist could set
--   price_paid to any number on their own show's tickets - which is the figure
--   /admin/billing sums into gross ticket volume and the MadGigz fee - or flip
--   refunded to true, making a paying fan's ticket vanish without a cent
--   moving.
--
--   "Artists can update their own events"
--      for update using (auth.uid() = artist_id)
--
--   let an artist set sold = 0 on a sold-out show. sold is not a display
--   counter: addendum_006 made it the atomic capacity reservation
--   ("update events set sold = sold + q where sold + q <= capacity"), so
--   zeroing it re-opens a full venue and oversells the room. house_run was
--   writable too, and that decides whether the money is transferred to the
--   artist or kept by the platform.
--
-- Run this in the Supabase SQL editor.

-- ============ TICKETS ============

revoke update on public.tickets from anon, authenticated;

-- Checking someone in at the door is the only thing an artist's browser has
-- ever needed to write here (profile/scan/page.tsx). Everything else - refunds,
-- hiding a refunded ticket, the Stripe ids, what was paid - goes through the
-- service-role client in admin/actions.ts, saved/actions.ts and the webhook.
--
-- The row policy still applies on top of this: an artist can only reach tickets
-- for their own events, and a fan can reach none.
grant update (checked_in_at) on public.tickets to authenticated;

-- ============ EVENTS ============

revoke update on public.events from anon, authenticated;

-- Hiding and unhiding a show is the one event edit the browser makes directly
-- (ManageShowModal's visibility toggle). Editing the details goes through
-- updateShow() in profile/show-actions.ts, which is a server action using the
-- service-role client and its own ownership check - so nothing legitimate
-- loses anything here.
grant update (active) on public.events to authenticated;

-- Inserting is still the artist's own (add-show/page.tsx), but only the fields
-- that form actually sends. Anything omitted keeps its column default, which
-- is what we want for sold (0) and house_run (false) - neither is the artist's
-- to declare at creation either.
revoke insert on public.events from anon, authenticated;
grant insert (
  artist_id,
  title,
  artist_name,
  venue,
  venue_id,
  city,
  event_date,
  event_time,
  price,
  currency,
  accent_color,
  category,
  image_url,
  capacity,
  max_per_order,
  description,
  lineup,
  doors,
  age_restriction,
  rating,
  ticketing_mode,
  ticketing_url
) on public.events to authenticated;

-- Deliberately NOT insertable or updatable by anyone's browser:
--   sold        - owned by the reservation RPC and the refund path.
--   house_run   - decides where the money goes; set in the admin panel only.
--   cancelled   - admin cancellation, which also issues the Stripe refunds.
--   created_at  - self-explanatory.

-- Same standing warning as addendum_018 and addendum_024: with column-level
-- grants in place, a column added later is NOT granted. A new artist-editable
-- event field has to be added to the grant above, or saving it fails with
-- 42501.
