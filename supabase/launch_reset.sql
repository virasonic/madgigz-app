-- ============================================================================
-- LAUNCH RESET — purge test/fake shows and zero the revenue figures (#95 launch)
-- ============================================================================
-- This is a ONE-OFF DATA operation, NOT a schema migration. It is destructive.
-- Run it BY HAND in the Supabase SQL editor, reading each step before running it.
--
-- WHAT IT DOES
--   Deletes fake/test events and their tickets. Deleting an event CASCADES to
--   most of what hangs off it (content_posts, event_artists, event_genres,
--   event_tiers, saved_events, event notifications) — BUT NOT tickets: the
--   tickets→events FK is ON DELETE RESTRICT (addendum_006 overrode schema.sql's
--   cascade), so tickets MUST be deleted first or Postgres refuses with a
--   foreign-key error (23503). Deleting the tickets also removes their transfer
--   records (ticket_transfers cascades from tickets).
--   Revenue is NOT a stored counter — the admin Billing page derives it live from
--   the tickets table — so once the test tickets are gone, every revenue figure
--   reads €0 on its own. Deleting tickets + events IS the reset.
--
-- WHY DELETING AT THE DB LEVEL IS SAFE HERE (and only here)
--   The app's normal "cancel show" path REFUNDS every ticket through Stripe. This
--   script does NOT — it deletes rows directly. That is correct *only* while all
--   tickets are Stripe TEST-mode (no real money). You are running this BEFORE the
--   live-payments flip, so that holds.
--   ⚠️  NEVER run this once real (live-mode) tickets exist — it would erase paid
--       orders without refunding anyone. After go-live, cancel shows through the
--       admin panel instead.
--
-- WHAT IT LEAVES ALONE
--   • venues — kept, so you can reuse them when curating the real shows.
--   • profiles / users / follows — untouched.
--   • Orphaned Cloudflare Stream videos and Supabase Storage posters are NOT
--     cleaned by the cascade (only the app's delete path does that). Harmless
--     leftovers from test data; ignore, or tidy later.
--
-- HOW TO RUN: do STEP 1 first and READ the output. Then run STEP 2 (pick 2A or
-- 2B). Then STEP 3 to confirm. Do it on prod when you're ready to go live.
-- ============================================================================


-- ── STEP 1 — PREVIEW: see exactly what exists before deleting anything ───────
-- Run this block on its own. Nothing is deleted. Look at the numbers and the
-- list, and decide whether you're keeping any shows (STEP 2B) or none (STEP 2A).

select
  (select count(*) from public.events)         as events,
  (select count(*) from public.tickets)        as tickets,
  (select count(*) from public.content_posts)  as content_posts,
  (select count(*) from public.saved_events)   as saved_events;

-- Every show currently in the DB, newest first, with how many tickets it has.
select
  e.id,
  e.title,
  e.artist_name,
  e.venue,
  e.event_date,
  e.ticketing_mode,
  (select count(*) from public.tickets t where t.event_id = e.id) as tickets_sold
from public.events e
order by e.event_date desc;


-- ── STEP 2A — DELETE ALL SHOWS (recommended for a clean slate) ───────────────
-- Use this if you're curating the real shows fresh after the reset (nearly all
-- current shows are fake). Uncomment BOTH lines and run them together, in order —
-- tickets first (see the FK note at the top), then events.
--
-- delete from public.tickets;
-- delete from public.events;


-- ── STEP 2B — DELETE ALL EXCEPT A KEPT LIST (careful alternative) ────────────
-- Use this instead of 2A only if some real shows already exist and you want to
-- keep them. Paste their ids (from STEP 1) into BOTH lists, then uncomment + run.
-- Delete the tickets for the removed shows first, then the shows. Any test
-- tickets on the KEPT shows would still count toward revenue, so keep only shows
-- that genuinely have no test purchases.
--
-- delete from public.tickets
--  where event_id not in (
--    '00000000-0000-0000-0000-000000000000',  -- ← replace with real event ids
--    '11111111-1111-1111-1111-111111111111'
--  );
-- delete from public.events
--  where id not in (
--    '00000000-0000-0000-0000-000000000000',  -- ← same ids as above
--    '11111111-1111-1111-1111-111111111111'
--  );


-- ── STEP 3 — VERIFY: revenue is now zero ─────────────────────────────────────
-- Run after STEP 2. tickets should be 0 (2A) or only the kept shows' tickets
-- (2B). The admin Billing page will now show €0 gross / €0 revenue.

select
  (select count(*) from public.events)  as events_remaining,
  (select count(*) from public.tickets) as tickets_remaining;
