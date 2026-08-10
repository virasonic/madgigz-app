-- Lets MadGigz itself post to the feed.
--
-- Every content_post has so far belonged to a show: event_id is not null, and
-- the reel card renders a "Tickets available now" panel pointing at it. That is
-- exactly right for an artist promoting a gig and exactly wrong for "here is
-- how the app works", which is what a brand-new signup needs and what there has
-- been no way to say.
--
-- An announcement is simply a post with no event. No new table and no
-- is_announcement flag: the absence of a show IS the distinction, and a boolean
-- that has to agree with a nullable column is a second source of truth waiting
-- to disagree with the first.
--
-- Run this in the Supabase SQL editor.

alter table public.content_posts alter column event_id drop not null;

-- show_title is not null and means nothing without a show. Default it so an
-- announcement insert doesn't have to pass an empty string by hand.
alter table public.content_posts alter column show_title set default '';

-- Admins only. Deliberately not "approved artists": the feed is a shared space,
-- and a post with no show attached carries MadGigz's own voice rather than an
-- artist's. The existing artist policy (addendum_013) cannot be used for these
-- anyway - both of its branches look up content_posts.event_id, and with a null
-- event_id they find nothing and refuse.
create policy "Admins can post announcements" on public.content_posts
  for insert with check (
    content_posts.event_id is null
    and exists (
      select 1 from public.profiles where id = auth.uid() and role = 'admin'
    )
  );

create policy "Admins can delete announcements" on public.content_posts
  for delete using (
    content_posts.event_id is null
    and exists (
      select 1 from public.profiles where id = auth.uid() and role = 'admin'
    )
  );

-- The feed reads content_posts with a plain select and the existing "Content is
-- viewable by everyone" policy already covers these, so nothing changes for
-- readers.
