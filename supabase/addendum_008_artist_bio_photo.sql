-- Addendum: lets artists personalize their public profile with a short bio
-- and a photo, separate from the private verification "evidence" upload.
-- Run this once in the Supabase SQL Editor.

alter table public.profiles add column if not exists artist_bio text;
alter table public.profiles add column if not exists artist_photo_url text;

-- No RLS changes needed: "Profiles are viewable by everyone" (select) and
-- "Users can update own profile" (update, auth.uid() = id) already cover
-- these two columns like every other profile field.
