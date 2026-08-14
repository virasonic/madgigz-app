-- Addendum 037: transfer / gift a ticket to another fan (#145), via a one-time
-- claim link. Now that every seat is its own ticket row (addendum_036), a single
-- ticket can change hands cleanly.
--
-- WHAT MOVES: a transfer reassigns the ticket's owner (tickets.user_id) from the
-- sender to whoever claims the link. It does NOT touch price_paid, the Stripe
-- ids, application_fee_*, or the event's sold counter — so:
--   * a later refund still returns money to the ORIGINAL payer's card (the only
--     card Stripe can refund to), read from the unchanged stripe_payment_intent_id;
--   * the seat stays "sold" (an UPDATE of user_id doesn't fire on_ticket_created).
-- The ticket_transfers row is the audit trail of who held it and who claimed it.
--
-- THE QR PROBLEM (flagged in the backlog): the door scanner reads the ticket's
-- QR, which until now encoded tickets.id — a value the sender keeps a screenshot
-- of. Reassigning ownership alone would leave the sender's old screenshot still
-- scannable. So this adds tickets.qr_secret: the QR/Wallet barcode now carries
-- the SECRET, the scanner looks tickets up by it, and a claim ROTATES it — which
-- kills the sender's pre-transfer screenshot. (Two holders of the *current*
-- secret can still race the door, but check-in is single-scan-wins since the
-- addendum_036 session, so only one gets in — the same irreducible property any
-- forwardable QR has.)
--
-- SAFE TO RUN ON A LIVE DB, single phase. The app code that ships before this
-- degrades: the QR falls back to tickets.id when qr_secret is absent, the scanner
-- falls back to an id lookup, and the transfer UI/actions catch 42P01 (table
-- missing) and 42703 (column missing) and no-op. Run on STAGING first, verify a
-- transfer round-trip (send link → claim on a second account → sender's old QR
-- stops scanning, recipient's works), then PROD.

-- 1. Rotatable scan secret. Defaults to a fresh uuid per new ticket (so it is
--    NOT the public id), backfilled to the id for any existing row so its
--    already-issued QR/Wallet pass keeps scanning. NOT NULL after backfill.
alter table public.tickets add column if not exists qr_secret uuid default gen_random_uuid();
update public.tickets set qr_secret = id where qr_secret is null;
alter table public.tickets alter column qr_secret set not null;

-- The scanner looks tickets up by qr_secret; index it. (id keeps its PK index for
-- the pass route and admin, which still key on the stable id.)
create index if not exists tickets_qr_secret_idx on public.tickets (qr_secret);

-- 2. Pending / claimed / cancelled transfers.
create table if not exists public.ticket_transfers (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  from_user_id uuid not null references public.profiles(id) on delete cascade,
  to_user_id uuid references public.profiles(id) on delete set null,
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'claimed', 'cancelled')),
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);

-- At most one live (pending) transfer per ticket — "one active transfer at a
-- time". Cancelled/claimed rows don't count, so a ticket can be re-transferred.
create unique index if not exists ticket_transfers_one_pending_per_ticket
  on public.ticket_transfers (ticket_id)
  where status = 'pending';

-- Look up a claim link by its token.
create index if not exists ticket_transfers_token_idx on public.ticket_transfers (token);

-- 3. RLS. Every WRITE goes through the service-role server actions in
--    saved/transfer-actions.ts (which check ownership, un-scanned, not-refunded,
--    event-upcoming in code — the hideRefundedTicket / check-in pattern), so no
--    insert/update/delete policy is granted to the browser. The only thing the
--    browser reads directly is "do I have a pending transfer on this ticket?",
--    to show the pending badge — hence a single owner-scoped select policy.
alter table public.ticket_transfers enable row level security;

create policy "Users can view transfers they created" on public.ticket_transfers
  for select using (auth.uid() = from_user_id);

-- Base table privilege for the select above (RLS narrows the rows). Writes are
-- deliberately NOT granted to anon/authenticated — service_role only.
grant select on public.ticket_transfers to authenticated;
