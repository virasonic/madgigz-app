-- addendum_056_refund_requests.sql
--
-- Fan-initiated refund REQUESTS (#146). The policy is "final sale unless the
-- show is cancelled", and issuing a refund stays an admin action (refundTicket,
-- #51) that moves real money - but a fan had no way to ASK for one. This table
-- is that queue: a fan requests a refund on a ticket they hold, it lands in
-- /admin/refunds, and an admin approves (which fires the existing refundTicket)
-- or declines. The request never moves money on its own.
--
-- Classification: OWNER + SERVICE-ROLE. A fan reads and writes (insert, and
-- cancel = delete) only their OWN pending requests; the admin reads and resolves
-- every request through the service-role client (which bypasses RLS). Never
-- granted to anon, not world-readable; RLS keyed on auth.uid(). No explicit
-- grant needed (new public-schema tables inherit the default authenticated grant,
-- and RLS is the gate). `reason` is the fan's own free text; `admin_note`,
-- `status` and the resolution columns are written service-role only.
--
-- Safe to run on a live DB (purely additive). The app degrades gracefully until
-- this runs: the fan "request refund" write catches 42P01 (table missing) and
-- fails softly, the owned-ticket sheet simply shows no pending state, and
-- /admin/refunds shows a "run addendum_056" note.

create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  status text not null default 'pending', -- pending | approved | declined
  admin_note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id)
);

-- At most one request in flight per ticket, so a fan can't spam the queue and
-- the admin sees one row per ticket. Settled requests don't block a re-request.
create unique index if not exists refund_requests_one_pending_per_ticket
  on public.refund_requests (ticket_id) where status = 'pending';

-- The admin reads the queue filtered by status, newest first.
create index if not exists refund_requests_status_created_idx
  on public.refund_requests (status, created_at desc);

alter table public.refund_requests enable row level security;

create policy "Users can view their own refund requests" on public.refund_requests
  for select using (auth.uid() = user_id);

-- Insert only for a ticket the fan actually owns (defence in depth on top of the
-- server action's own ownership + eligibility checks).
create policy "Users can request a refund on their own ticket" on public.refund_requests
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.tickets t
      where t.id = ticket_id and t.user_id = auth.uid()
    )
  );

-- Cancelling a request is a delete, allowed only while it is still pending.
create policy "Users can cancel their own pending request" on public.refund_requests
  for delete using (auth.uid() = user_id and status = 'pending');
