-- Follow-up to addendum_015. The three existing evidence files have been copied
-- into the private artist-evidence bucket, recorded in artist_evidence, and the
-- public originals deleted - verified by fetching the old URLs anonymously and
-- getting 400s. profiles.evidence_url is now empty and nothing reads it, so the
-- column that caused the leak can go.
--
-- Run this in the Supabase SQL editor.

-- Refuse if anything still points at a public file - that would mean a copy was
-- missed and dropping the column would lose the only reference to it.
do $$
declare
  remaining integer;
begin
  select count(*) into remaining from public.profiles where evidence_url is not null;
  if remaining > 0 then
    raise exception 'Still % profile(s) with evidence_url set - migrate those files first', remaining;
  end if;
end $$;

alter table public.profiles drop column if exists evidence_url;
