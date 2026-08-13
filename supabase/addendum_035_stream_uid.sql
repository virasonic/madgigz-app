-- addendum_035_stream_uid.sql
--
-- #138: move reel VIDEO off raw Supabase Storage onto Cloudflare Stream
-- (transcode + adaptive HLS + CDN + auto thumbnails). A video content_post now
-- stores the Cloudflare Stream video id here; playback + thumbnail URLs are
-- derived from it client-side (customer-<code>.cloudflarestream.com/<uid>/...).
--
-- Public column: the Stream uid appears in public playback URLs anyway, and
-- content_posts is world-readable through the existing row policy
-- ("Content is viewable by everyone" = using(true)). content_posts uses
-- ROW-level policies, not the column-level GRANTs that public.profiles carries,
-- so a plain add column is fully readable — no extra grant needed (unlike a new
-- profiles column, which would).
--
-- Additive and nullable, so it is SAFE to run on the live DB with no two-phase
-- split: existing rows get NULL and keep playing their Supabase `media_url`
-- (the app falls back to media_url whenever stream_uid is null). New video posts
-- set stream_uid and leave media_url null. Code that reads the column ships
-- before this runs and degrades gracefully — a missing column surfaces as 42703
-- and mapContentPost simply sees `undefined` → null.

alter table public.content_posts
  add column if not exists stream_uid text;
