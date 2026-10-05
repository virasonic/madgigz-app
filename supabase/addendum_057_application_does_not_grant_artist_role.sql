-- Addendum 057: an artist APPLICATION no longer makes someone an artist (#209).
--
-- startArtistUpgrade used to set role='artist' + artist_status='pending' the
-- moment a fan applied, and setArtistStatus only ever wrote the status back - so
-- a rejected applicant was left at role='artist', artist_status='rejected'
-- forever. Nothing in the app serves that state: the artist tools gate on
-- approval, and the fan profile (saved shows, attended wall) is role='fan' only,
-- so those accounts had a dead-end Profile tab. Five real accounts were in it on
-- prod when this was found.
--
-- The model is now: the ROLE follows the decision, not the application. A fan
-- applies (artist_status='pending', still a fan), approval promotes to 'artist',
-- rejection returns them to 'fan'. This backfills the rows already stranded.
--
-- NO SECURITY CHANGE. Every RLS policy keys on artist_status='approved', never on
-- role, so a pending or rejected applicant could not insert an event or a content
-- post under the old shape either. This only changes what the APP shows them.
--
-- Approved artists are untouched. Admins are untouched (an admin who is also an
-- approved artist must stay in /admin).
--
-- SAFE TO RUN ON A LIVE DB, single phase. The code shipping alongside tolerates
-- both shapes - the claim-form guard and the admin queue key on artist_status,
-- not role - so running this late changes nothing except unsticking the rows.
-- Run on STAGING first, then PROD.

update public.profiles
   set role = 'fan'
 where role = 'artist'
   and artist_status in ('pending', 'rejected');

-- Expected on prod at the time of writing: 5 rows (all 'rejected'), 0 on staging.
-- Verify afterwards - this should return no rows:
--   select id, username, role, artist_status from public.profiles
--    where role = 'artist' and artist_status is distinct from 'approved';
