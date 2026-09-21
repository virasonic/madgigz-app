-- Addendum 055: who a MadGigz announcement is for.
--
-- An announcement is a content_post with no event (addendum_028), shown in the
-- For You feed to everyone who scrolls it. But the feed is browsed by fans AND
-- by organisers (artists, promoters, venues — they explore shows too, #170), and
-- some announcements only make sense to one side: "here's how to upload your
-- content" is noise to a fan, "buy early, shows sell out" is noise to a promoter.
--
-- `audience` lets an announcement say which side it's for. NULL (the default and
-- every existing row) means everyone, so this changes nothing until an admin
-- picks otherwise. The feed filters on it in code keyed on the viewer's role;
-- it is NOT a security boundary (content_posts is world-readable and an
-- announcement carries no private data) — it's noise control.
--
-- PUBLIC column. content_posts is world-readable through a `using (true)` select
-- policy AND a blanket table-level grant (it is NOT under the profiles
-- column-grant regime from addendum_018), so a newly-added column is readable by
-- anon/authenticated automatically — no `grant select (...)` needed here.
--
-- SAFE TO RUN ON A LIVE DB, single phase, additive. Nullable, no default, so
-- existing rows are untouched and read as "everyone". Code that ships before
-- this degrades: the feed reads content_posts via select("*") (missing column
-- reads as null → everyone), and the admin insert catches the missing-column
-- error (42703) and retries without the audience field. Run on STAGING first,
-- then PROD.

alter table public.content_posts
  add column if not exists audience text;  -- null = everyone; 'fans'; 'organisers'
