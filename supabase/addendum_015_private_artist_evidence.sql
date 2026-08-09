-- Artist verification evidence was being uploaded into the public event-media
-- bucket, and profiles is `select using (true)`, so profiles.evidence_url was
-- readable by anyone - logged out included. Verified: an anonymous client could
-- list every artist's evidence URL and download the file. That is fine for
-- posters; it is not fine for anything someone sends to prove who they are.
--
-- Row level security is row-level, so a single column can't be hidden from a
-- policy that returns every row. The path therefore moves to its own table, and
-- profiles keeps only a harmless boolean saying whether evidence exists.
--
-- Run this in the Supabase SQL editor.

-- 1. Private bucket. No public flag, and deliberately no SELECT policy: nothing
--    but the service role reads these, and the admin panel hands out
--    short-lived signed URLs.
insert into storage.buckets (id, name, public)
values ('artist-evidence', 'artist-evidence', false)
on conflict (id) do nothing;

drop policy if exists "Artists upload their own evidence" on storage.objects;
create policy "Artists upload their own evidence" on storage.objects
  for insert with check (
    bucket_id = 'artist-evidence'
    -- First path segment must be the uploader's own id, so one artist can't
    -- write into another's folder.
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 2. The path lives here, where the default-deny of RLS actually protects it.
create table if not exists public.artist_evidence (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  storage_path text not null,
  uploaded_at timestamptz not null default now()
);

alter table public.artist_evidence enable row level security;

create policy "Artists can record their own evidence" on public.artist_evidence
  for insert with check (profile_id = auth.uid());

-- An artist may see that their own row exists. Admins read everything through
-- the service role, which bypasses RLS - there is no policy granting anyone
-- else a read, which is the point.
create policy "Artists can see their own evidence row" on public.artist_evidence
  for select using (profile_id = auth.uid());

-- 3. A boolean is all the app needs in profiles: it drives "have they finished
--    the claim form", and leaks nothing.
alter table public.profiles
  add column if not exists evidence_submitted boolean not null default false;

update public.profiles
set evidence_submitted = true
where evidence_url is not null;

-- profiles.evidence_url is intentionally left in place for now. The files it
-- points at still have to be copied into the private bucket and the public
-- originals deleted; dropping the column first would lose the only reference to
-- them. See addendum_016.
