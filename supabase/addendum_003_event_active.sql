-- Addendum: adds an "active" flag to events for admin moderation (hide, not
-- hard-delete, since real tickets/content can already reference an event).
-- Run this once in the Supabase SQL Editor.

alter table public.events add column if not exists active boolean not null default true;
