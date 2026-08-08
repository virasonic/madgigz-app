-- Addendum: lets a fan clear a refunded ticket off their own Tickets list.
-- The ticket row itself is never deleted - it's the record of money that
-- moved, already relied on by admin billing/event-detail reporting - this
-- just adds a per-user "hide from my list" flag.
-- Run this once in the Supabase SQL Editor.

alter table public.tickets add column if not exists hidden_at timestamptz;

-- No RLS policy needed: hiding is done through a server action using the
-- admin client (which bypasses RLS), with ownership + refunded-status
-- checked in application code - see hideRefundedTicket in
-- src/app/(app)/saved/actions.ts. A client-writable RLS policy would let a
-- signed-in fan hide any column on the row via a raw PATCH, not just
-- hidden_at, which a server action avoids entirely.
