-- Addendum: allow uploaders to delete their own event-media Storage objects.
-- Only SELECT and INSERT policies existed on storage.objects, so an artist
-- removing a show's poster/content files silently did nothing (remove()
-- doesn't error - RLS just filters the delete down to zero matching rows).
-- Run this once in the Supabase SQL Editor.

create policy "Owners can delete their own event media" on storage.objects
  for delete using (bucket_id = 'event-media' and auth.uid() = owner);
