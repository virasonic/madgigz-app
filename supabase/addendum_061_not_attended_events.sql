-- addendum_061_not_attended_events.sql
--
-- The "Were you there?" prompt (#116) lists past shows a fan saved but wasn't
-- scanned in to, and only let them answer "Yes, I went" (which writes
-- attended_events). A fan who did NOT go had no way to answer, so the same shows
-- kept reappearing and the attendance signal was yes-only. This table records a
-- "No, I didn't go" so the prompt can drop that show for good AND we keep an
-- accurate not-attended signal, without ever touching the attended wall.
--
-- Kept SEPARATE from attended_events on purpose: a boolean on that table would
-- have forced every wall read to filter on a new column and regress until the
-- migration ran. A new table instead means the wall is untouched and the prompt
-- simply excludes shows in either table.
--
-- Classification: OWNER-ONLY, exactly like attended_events / saved_events - a fan
-- reads and writes only their own rows. Not world-readable; RLS keyed on
-- auth.uid(). No explicit grant needed (new public-schema tables inherit the
-- default authenticated grant, and RLS is the gate).
--
-- Safe to run on a live DB (purely additive). The app degrades gracefully until
-- this runs: fetchNotAttendedEventIds catches 42P01 (table missing) and returns
-- an empty set, and the "No" write just fails softly.

create table if not exists public.not_attended_events (
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

alter table public.not_attended_events enable row level security;

create policy "Users can view their own not-attendance" on public.not_attended_events
  for select using (auth.uid() = user_id);
create policy "Users can mark their own not-attendance" on public.not_attended_events
  for insert with check (auth.uid() = user_id);
create policy "Users can unmark their own not-attendance" on public.not_attended_events
  for delete using (auth.uid() = user_id);
