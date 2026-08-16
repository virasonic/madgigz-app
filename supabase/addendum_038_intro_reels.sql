-- Addendum 038: artist introduction reels (#143). One pinned "this is me" reel
-- per artist, shown on their profile even when they have no show to promote — so
-- discovery starts with a face and a sound, not a text bio.
--
-- WHY a flag and not "event_id is null": that null ALREADY means "MadGigz
-- announcement" (addendum_028) — the feed keys off it. An intro reel is also
-- event-less, so it needs its own marker or it would render as an announcement.
-- Hence is_intro. The feed excludes is_intro posts (they live on the profile,
-- not in For You — the #142 cold-start injection is a later, separate call);
-- the artist profile shows the one where is_intro is true.
--
-- SAFE TO RUN ON A LIVE DB, single phase. Code that ships before this degrades:
-- the feed filters is_intro in JS (absent column → undefined → treated as not
-- intro, and none exist yet), and fetchArtistIntro catches the missing column
-- (42703) and returns null. Reuses the existing content-post + Cloudflare Stream
-- pipeline — no new media plumbing. Run on STAGING first, then PROD.

alter table public.content_posts add column if not exists is_intro boolean not null default false;

-- One intro per artist. A "replace" deletes the old intro row first (see
-- profile/intro-actions.ts), so this only ever guards against a double-insert.
create unique index if not exists content_posts_one_intro_per_artist
  on public.content_posts (artist_id)
  where is_intro;

-- No new grant needed: content_posts INSERT/SELECT for authenticated is the
-- default full-table grant (addendum_026 only column-restricted tickets/events),
-- and the existing row policies already scope writes to the artist's own posts
-- ("Artists can insert their own content" / "...delete their own content") and
-- keep reads world-visible ("Content is viewable by everyone").
