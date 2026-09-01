-- addendum_047_admin_decisions.sql
-- #164: the decision ledger. A service-role-only audit table recording every
-- operational decision — artist approvals/rejections, content-report actions,
-- refunds, cancellations, artist tags — so we build a record of admin judgment
-- now. It is a plain audit trail today, and the training corpus for the future
-- ops-agent (see the ops-brain vision, #163): "the matcher was right N of M".
--
-- SAFE ON A LIVE DB — purely additive (a new table, no existing object touched).
-- No two-phase split needed: the revoke below removes grants on a brand-new
-- table nothing is deployed against yet.
--
-- CLASSIFICATION: service-role-only (audit/sensitive, like stripe_account_id).
-- RLS is enabled with NO policies, so anon/authenticated are denied entirely;
-- service_role bypasses RLS. Grants are also revoked as belt-and-braces. The app
-- writes via the service-role client from admin server actions, and degrades
-- gracefully (logDecision catches 42P01) until this file is run by hand.
--
-- Run order: staging Supabase first, verify on staging, then prod.

create table if not exists public.admin_decisions (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  -- Who decided. Nullable so an agent (actor_type='agent') or a since-deleted
  -- admin still leaves a row.
  actor_id     uuid references public.profiles(id) on delete set null,
  actor_type   text not null default 'human' check (actor_type in ('human', 'agent')),
  -- Free text (not an enum) so a new decision kind never needs a migration.
  -- Known values: artist_approved, artist_rejected, event_cancelled,
  -- event_deleted, ticket_refunded, post_hidden, post_unhidden,
  -- report_actioned, report_dismissed, report_reopened, artist_tagged.
  action       text not null,
  subject_type text,          -- 'artist' | 'event' | 'ticket' | 'post' | 'report'
  subject_id   text,          -- id of the thing acted on (text: ids vary)
  -- Nullable free-text rationale. The agent fills this; humans optionally.
  reason       text,
  -- Agent-era fields, null for human decisions.
  confidence   real,
  disposition  text check (disposition is null or disposition in ('auto', 'escalated')),
  metadata     jsonb not null default '{}'::jsonb
);

create index if not exists admin_decisions_created_at_idx
  on public.admin_decisions (created_at desc);
create index if not exists admin_decisions_subject_idx
  on public.admin_decisions (subject_type, subject_id);

alter table public.admin_decisions enable row level security;
-- RLS on + no policy = anon/authenticated denied; service_role bypasses.
revoke all on public.admin_decisions from anon, authenticated;
