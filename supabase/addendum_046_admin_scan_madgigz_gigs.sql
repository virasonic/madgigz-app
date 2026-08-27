-- addendum_046_admin_scan_madgigz_gigs.sql
--
-- Let an admin scan tickets at the door for MadGigz-organised (ownerless) gigs
-- (#157). The artist scanner's read + check-in policies key on
-- events.artist_id = auth.uid(), which is null for these events, so nobody could
-- read or check in their tickets. These two additive, permissive policies grant
-- an admin read + check-in ONLY for ownerless events (least privilege - an admin
-- still can't touch tickets for an artist's own gig). They OR with the existing
-- owner/artist policies rather than replacing them.
--
-- Safe on a live DB (additive; the update column grant on checked_in_at already
-- covers `authenticated` from addendum_026). Code degrades gracefully before
-- this runs: the admin scanner simply reads no ticket (shows "invalid") and the
-- check-in update matches zero rows (shows the duplicate warning) - never an
-- error.

create policy "Admins can view tickets for MadGigz events" on public.tickets
  for select to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    and exists (
      select 1 from public.events e where e.id = tickets.event_id and e.artist_id is null
    )
  );

create policy "Admins can check in tickets for MadGigz events" on public.tickets
  for update to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    and exists (
      select 1 from public.events e where e.id = tickets.event_id and e.artist_id is null
    )
  );
