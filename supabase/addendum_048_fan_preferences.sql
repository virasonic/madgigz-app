-- addendum_048_fan_preferences.sql
--
-- #170: fan discovery preferences. A fan can pick favourite genres, preferred
-- days of the week, times of day and venue sizes; these are a SOFT ranking boost
-- on Explore (matching shows float up), never a hard filter, so nothing is ever
-- hidden. One row per fan, all four dimensions as arrays.
--
-- Classification: OWNER-ONLY. A fan's preferences are personal, read and written
-- only by that fan's own session (and service_role). Never granted to anon, and
-- not world-readable — so RLS keyed on auth.uid(), exactly like saved_events. No
-- explicit grant needed: new public-schema tables inherit the default
-- authenticated grant (saved_events carries none either), and RLS is the gate.
--
-- Safe to run on a live DB (purely additive). The app degrades gracefully until
-- this runs: fetchFanPreferences catches 42P01 (table missing) and returns empty
-- preferences, so Explore just doesn't boost.

create table if not exists public.fan_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  genre_ids uuid[] not null default '{}',
  -- 0 = Monday … 6 = Sunday (matches the app's Mon-first day labels).
  weekdays smallint[] not null default '{}',
  -- 'afternoon' (<18:00) | 'evening' (18:00–21:59) | 'late' (>=22:00)
  time_buckets text[] not null default '{}',
  -- 'small' (<150) | 'medium' (150–500) | 'large' (>500)
  capacity_buckets text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.fan_preferences enable row level security;

create policy "Users can view their own preferences" on public.fan_preferences
  for select using (auth.uid() = user_id);
create policy "Users can set their own preferences" on public.fan_preferences
  for insert with check (auth.uid() = user_id);
create policy "Users can update their own preferences" on public.fan_preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can clear their own preferences" on public.fan_preferences
  for delete using (auth.uid() = user_id);
