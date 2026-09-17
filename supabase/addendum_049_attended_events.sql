-- addendum_049_attended_events.sql
--
-- Manual "I was there" attendance. The poster wall (#116) only shows shows the
-- fan was SCANNED IN to with a MadGigz ticket, so a gig bought outside the app
-- (external ticketing) can never land there. This table lets a fan mark a past
-- show as attended by hand; the wall unions these manual marks with scanned-in
-- tickets (deduped), so both count.
--
-- Classification: OWNER-ONLY, exactly like saved_events - a fan reads and writes
-- only their own rows. Never granted to anon, not world-readable; RLS keyed on
-- auth.uid(). No explicit grant needed (new public-schema tables inherit the
-- default authenticated grant, and RLS is the gate).
--
-- Safe to run on a live DB (purely additive). The app degrades gracefully until
-- this runs: the attendance reads catch 42P01 (table missing) and fall back to
-- scanned-in tickets only, and the "I was there" write just fails softly.

create table if not exists public.attended_events (
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

alter table public.attended_events enable row level security;

create policy "Users can view their own attendance" on public.attended_events
  for select using (auth.uid() = user_id);
create policy "Users can mark their own attendance" on public.attended_events
  for insert with check (auth.uid() = user_id);
create policy "Users can unmark their own attendance" on public.attended_events
  for delete using (auth.uid() = user_id);
