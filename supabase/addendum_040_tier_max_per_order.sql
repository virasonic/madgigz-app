-- Addendum 040: per-ticket-type "max per order" (#151 reshape). Each price tier
-- can now cap how many of THAT type one order may buy — e.g. max 2 VIP, max 4
-- General — instead of a single event-wide limit. The event-level
-- events.max_per_order stays for legacy single-price shows (no tiers); a tiered
-- checkout enforces the tier's own cap.
--
-- SAFE TO RUN ON A LIVE DB, single phase, additive. Defaults to 6 (the old
-- event default), so any tier created before this — and the checkout before it
-- deploys — behaves exactly as it did. Run on STAGING first, then PROD.

alter table public.event_tiers
  add column if not exists max_per_order integer not null default 6;
