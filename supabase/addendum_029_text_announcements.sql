-- Lets an admin write an announcement in the panel and have it rendered on the
-- brand template, instead of uploading a pre-made image.
--
-- The template is a real CSS card (see AnnouncementCard), not a generated PNG:
-- it works on Vercel with no image toolchain, stays editable, and always looks
-- current if the brand changes. So a text announcement needs no media at all,
-- and it needs somewhere to keep the headline and the accent tint.
--
-- Run this in the Supabase SQL editor, after addendum_028.

-- A text card has no image or video. media_url was NOT NULL because every post
-- used to be an artist reel about a show.
alter table public.content_posts alter column media_url drop not null;

-- media_type still can't be null (it has a default), but for a text card it is
-- meaningless. Add a value for it rather than leaving it lying about being an
-- image. Requires extending the enum.
do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'media_type' and e.enumlabel = 'text'
  ) then
    alter type media_type add value 'text';
  end if;
end $$;

-- The headline (the big line) and the accent that tints the card's glow. The
-- body text reuses `caption`, which every post already has. show_title is left
-- for the generated-set marker it already carries.
alter table public.content_posts add column if not exists headline text;
alter table public.content_posts add column if not exists accent_color text;

-- content_posts is world-readable through "Content is viewable by everyone", a
-- table-level select policy rather than column grants, so new columns are
-- covered automatically here - unlike the profiles table. Nothing to grant.
