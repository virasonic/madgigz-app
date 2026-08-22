-- Addendum 043: optional Spanish variants of a MadGigz announcement's text, so a
-- feed announcement follows the reader's language. The app is bilingual (en/es);
-- until now an announcement was written once, in whatever language the admin
-- typed, and every fan saw that. These columns let the admin supply a Spanish
-- headline/body alongside the base one; AnnouncementCard then shows the Spanish
-- to es readers and the base to everyone else, falling back to the base whenever
-- the Spanish is left blank.
--
-- PUBLIC data. content_posts is world-readable through a `using (true)` select
-- policy AND a blanket table-level grant (it is NOT under the profiles
-- column-grant regime from addendum_018), so a newly-added column is readable by
-- anon/authenticated automatically — no `grant select (...)` needed here.
--
-- SAFE TO RUN ON A LIVE DB, single phase, additive. Nullable, no default, so
-- existing rows are untouched and a post with no Spanish simply shows its base
-- text to all readers. Code that ships before this degrades: the feed reads
-- content_posts via select("*") (missing columns read as null → base text), and
-- the admin insert catches the missing-column error (42703) and retries without
-- the Spanish fields. Run on STAGING first, then PROD.

alter table public.content_posts
  add column if not exists headline_es text,  -- Spanish headline (text announcements)
  add column if not exists caption_es  text;  -- Spanish body/caption (all announcement types)
