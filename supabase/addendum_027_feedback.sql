-- Backlog #94: a way for fans and artists to tell us something, and a place for
-- an admin to read it.
--
-- Deliberately called "feedback" and not "tickets" - the app already sells
-- those, /admin/billing already lists them, and a support queue sharing the
-- word would make every conversation about it ambiguous.
--
-- Run this in the Supabase SQL editor.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),

  -- on delete set null, not cascade: someone deleting their account should not
  -- also delete the bug report that told us the checkout was broken. The
  -- message stays, attributed to nobody. See addendum_019 - the account purge
  -- is the reason this distinction matters here.
  user_id uuid references public.profiles(id) on delete set null,

  -- Text with a check, same reasoning as notifications in addendum_022: adding
  -- a category later is an ALTER on the constraint rather than a migration that
  -- touches a type other objects depend on.
  type text not null default 'idea' check (type in ('bug', 'support', 'idea')),
  message text not null check (char_length(trim(message)) between 1 and 4000),

  -- Context captured at submission rather than asked for. Someone reporting
  -- "the button doesn't work" should not also have to say which screen they
  -- were on, and the answer they'd give a week later is worse than the one the
  -- browser already knows.
  route text,
  -- Their role WHEN THEY WROTE IT. A fan who later becomes an artist shouldn't
  -- retroactively turn an old report into an artist's report - the whole point
  -- of the field is knowing which version of the app they were looking at.
  role_at_submission text,
  -- The email is copied rather than joined, so a reply is still possible after
  -- the account is gone and user_id has been nulled.
  contact_email text,

  status text not null default 'new' check (status in ('new', 'open', 'resolved')),
  admin_note text,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- The admin queue is read newest-first and filtered by status, which is what
-- this covers. Nothing reads feedback by user, so there is no index for it.
create index if not exists feedback_status_created_idx
  on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;

-- Read your own, so a "thanks, we got it" screen is possible later. Notably
-- NOT "viewable by everyone" - a support message can contain anything, and
-- this project has been caught out twice by a permissive select policy on a
-- table holding something private.
create policy "Users read their own feedback" on public.feedback
  for select using (auth.uid() = user_id);

create policy "Users can send feedback" on public.feedback
  for insert with check (auth.uid() = user_id);

-- No update or delete policy at all. Nobody edits a submission after sending
-- it, and triage (status, admin_note, resolved_*) belongs to the admin panel,
-- which goes through the service-role client.

-- Columns, not just rows - the lesson of addendum_018, 024 and 026. Without
-- this, the insert policy above would let someone submit their own feedback
-- pre-marked 'resolved', or write an admin_note into it.
revoke insert on public.feedback from anon, authenticated;
grant insert (user_id, type, message, route, role_at_submission, contact_email)
  on public.feedback to authenticated;

revoke select on public.feedback from anon, authenticated;
grant select (id, type, message, route, status, created_at, resolved_at, user_id)
  on public.feedback to authenticated;
