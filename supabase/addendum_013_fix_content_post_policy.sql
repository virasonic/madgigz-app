-- Fixes a gap left by addendum_012.
--
-- That migration dropped "Artists can insert their own content" - the name from
-- schema.sql - but addendum_005 had already replaced it with "Approved artists
-- can insert their own content". So the drop was a no-op, the old policy
-- survived, and because permissive policies are OR'd together it kept letting
-- any approved artist post on any show. Verified: an artist neither owning nor
-- tagged on a show could still attach content to it.
--
-- This drops the policy that actually exists and folds its approved-artist
-- requirement into the ownership/tag check, so exactly one insert policy
-- remains.
--
-- Run this in the Supabase SQL editor.

drop policy if exists "Approved artists can insert their own content" on public.content_posts;
drop policy if exists "Artists can post on their own or tagged shows" on public.content_posts;

create policy "Approved artists can post on their own or tagged shows" on public.content_posts
  for insert with check (
    auth.uid() = artist_id
    -- Kept from addendum_005: posting is for approved artists only.
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and artist_status = 'approved'
    )
    and (
      exists (
        select 1 from public.events e
        where e.id = content_posts.event_id and e.artist_id = auth.uid()
      )
      or exists (
        select 1 from public.event_artists ea
        where ea.event_id = content_posts.event_id and ea.profile_id = auth.uid()
      )
    )
  );
