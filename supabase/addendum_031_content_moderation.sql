-- Backlog #96: a way for anyone to report a feed post, a queue for an admin to
-- judge it, and a way to pull a post without destroying it.
--
-- Today a fan or artist puts a photo or video on a public feed with nothing
-- between them and it, and the only way to take one down is a developer in the
-- database. This closes that before the app is promoted.
--
-- Run this in the Supabase SQL editor.

-- ============ 1. Pulling a post, reversibly ============

-- A hidden post stays in the table - the report trail and the artist's own
-- record need it - but drops out of every public surface. Soft, so a wrongly
-- hidden post can be restored, unlike a delete.
alter table public.content_posts add column if not exists hidden_at timestamptz;

-- content_posts is world-readable via a table-level select policy, so the app
-- must filter hidden_at itself. The queries do (fetchContentPosts,
-- fetchShowContent). Nothing to grant.

-- ============ 2. The reports ============

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),
  content_post_id uuid not null references public.content_posts(id) on delete cascade,
  -- on delete set null, not cascade: a reporter deleting their account should
  -- not erase the report that got a post taken down. Same call as feedback.
  reporter_id uuid references public.profiles(id) on delete set null,
  reason text not null check (reason in ('spam', 'inappropriate', 'hate', 'violence', 'other')),
  detail text check (detail is null or char_length(detail) <= 1000),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  admin_note text,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- One report per person per post: a second tap is not a second complaint. Two
-- different people reporting the same post is two rows, which is the signal
-- that matters.
create unique index if not exists content_reports_one_per_reporter
  on public.content_reports (content_post_id, reporter_id);

-- The queue is read newest-first, filtered by status.
create index if not exists content_reports_status_created
  on public.content_reports (status, created_at desc);

alter table public.content_reports enable row level security;

-- Read your own, so the UI can show "reported" and not offer it twice. NOT
-- world-readable: who reported what is nobody else's business.
create policy "Users read their own reports" on public.content_reports
  for select using (auth.uid() = reporter_id);

create policy "Users can report" on public.content_reports
  for insert with check (auth.uid() = reporter_id);

-- No update or delete policy. Triage (status, admin_note, resolved_*) is
-- admin-only through the service-role client.

-- Columns, per the lesson of addendum_024/026: without this the insert policy
-- would let someone file a report pre-marked 'dismissed' or with an admin_note.
revoke insert on public.content_reports from anon, authenticated;
grant insert (content_post_id, reporter_id, reason, detail)
  on public.content_reports to authenticated;

revoke select on public.content_reports from anon, authenticated;
grant select (id, content_post_id, reason, status, created_at, reporter_id)
  on public.content_reports to authenticated;
