-- Addendum 072: guest checkout (#234)
--
-- A fan can buy a ticket to certain shows with only an email address: no
-- account first. Vir's calls (21 Nov 2026): admin-only toggle per show, paid
-- shows only (Stripe's payment is the bot gate), and the ticket belongs to a
-- real profile from the start - at checkout MadGigz quietly creates an account
-- for the email (the pro-invite mechanism: email_confirm, random password),
-- the ticket row is owned by it, and the ticket email carries a "create your
-- account" link that sets a password and finishes onboarding. Nothing else
-- in the app has to learn about guests: the scanner, the guest list, the
-- wallet pass, refunds and transfers all key off tickets.user_id as before.
--
-- Both columns are written only by the service role. events.guest_checkout
-- is read through the existing world-readable select on events (the public
-- event page needs it to offer the guest route); profiles.guest_checkout_at
-- is deliberately NOT granted to anon/authenticated (addendum_018 column
-- grants) - it is an ops marker, read by nothing in the browser.
--
-- Run on staging, then prod. Code degrades gracefully before it runs: the
-- admin form reports "needs addendum_072" when the box is ticked, the public
-- page simply doesn't offer guest checkout, and the marker update is skipped.

-- ============ 1. Which shows allow it ============

alter table public.events
  add column if not exists guest_checkout boolean not null default false;

comment on column public.events.guest_checkout is
  'Admin-only: fans may buy with just an email, no account first (#234). Paid shows only; the code refuses a €0 guest order.';

-- ============ 2. Which profiles started life as a guest purchase ============

alter table public.profiles
  add column if not exists guest_checkout_at timestamptz;

comment on column public.profiles.guest_checkout_at is
  'Set when the account was created by a guest checkout (#234). onboarding_complete flips true once the person claims it. Service-role only.';
