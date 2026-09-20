-- #88, part 2: give promoter and venue accounts the organiser toolset in the
-- app — scan at the door, post content, hide a show.
--
-- Promoters, venues and artists are all ORGANISERS (Vir, 20 Sept 2026), so a
-- promoter standing at their own door needs the same scanner an artist gets.
-- The existing policies all key on `events.artist_id = auth.uid()`, which is
-- null for a show a promoter booked, so today they can read nothing and check in
-- nobody.
--
-- EVERY POLICY HERE IS ADDITIVE. Permissive policies are OR'd, so these sit
-- alongside the artist ones and widen nothing that already exists. Deliberately
-- NOT editing "Approved artists can post on their own or tagged shows" — that is
-- the policy addendum_012/013 got wrong twice by dropping a stale name, and a
-- separate policy cannot repeat that mistake.
--
-- Least privilege, mirroring addendum_046 (which did exactly this for admins on
-- ownerless gigs): each policy requires an ACTIVE pro account AND that the event
-- is one this account booked. A promoter still cannot touch an artist's gig, a
-- MadGigz house show, or another promoter's night — and a deactivated account
-- loses all of it at once, because `pa.active` is re-checked in every policy
-- rather than trusted from a session.
--
-- Referencing pro_accounts from inside a policy is safe: addendum_051's row
-- policy lets a caller see their own row, and `active` is in its column grant,
-- so the subquery resolves for the one row it needs and no other.
--
-- SAFE TO RUN ON A LIVE DB — purely additive, no revokes, no drops. The app
-- degrades cleanly before it runs, exactly as addendum_046's did: the scanner
-- reads no ticket (shows "invalid"), a check-in matches zero rows (shows the
-- duplicate warning), and a post insert is refused with a message. Never an
-- error, never a crash.
--
-- REQUIRES addendum_051. Run in the Supabase SQL editor: STAGING first, then
-- PROD.

-- ===================== 1. The door scanner =====================

drop policy if exists "Pro accounts can view tickets for their shows" on public.tickets;
create policy "Pro accounts can view tickets for their shows" on public.tickets
  for select to authenticated
  using (
    exists (
      select 1 from public.pro_accounts pa
      where pa.id = auth.uid() and pa.active
    )
    and exists (
      select 1 from public.events e
      where e.id = tickets.event_id and e.pro_account_id = auth.uid()
    )
  );

drop policy if exists "Pro accounts can check in tickets for their shows" on public.tickets;
create policy "Pro accounts can check in tickets for their shows" on public.tickets
  for update to authenticated
  using (
    exists (
      select 1 from public.pro_accounts pa
      where pa.id = auth.uid() and pa.active
    )
    and exists (
      select 1 from public.events e
      where e.id = tickets.event_id and e.pro_account_id = auth.uid()
    )
  );

-- No new column grant needed: addendum_026 already grants
-- `update (checked_in_at)` on tickets to authenticated, which is the only column
-- the scanner writes. So this policy widens WHICH ROWS a pro may check in and
-- nothing about which columns anyone may write.

-- ===================== 2. Posting content =====================

-- Note what is NOT required here, unlike the artist policy: artist_status =
-- 'approved'. A promoter is never an approved artist — that flag means "this
-- person is the act", and a promoter being vetted happens when MadGigz creates
-- their account by hand, which is a stronger gate than the artist self-claim it
-- would be standing in for.
drop policy if exists "Pro accounts can post on shows they booked" on public.content_posts;
create policy "Pro accounts can post on shows they booked" on public.content_posts
  for insert to authenticated with check (
    auth.uid() = artist_id
    and exists (
      select 1 from public.pro_accounts pa
      where pa.id = auth.uid() and pa.active
    )
    and exists (
      select 1 from public.events e
      where e.id = content_posts.event_id and e.pro_account_id = auth.uid()
    )
  );

-- Deleting their own post already works: "Artists can delete their own content"
-- is `auth.uid() = artist_id`, which is true of a post a promoter made. Nothing
-- to add.

-- ===================== 3. Hiding a show =====================

-- Hiding takes a show off Feed and Explore and is fully reversible; it touches
-- no money and no ticket. Deleting or cancelling deliberately stays out — a
-- cancellation refunds real people, so it remains an admin action a promoter
-- asks for, not a button they can reach past this policy.
--
-- addendum_026 already restricts `update` on events to the single column
-- `active` for authenticated, so this policy cannot become a route to editing a
-- price or a date even though `for update` reads broadly.
drop policy if exists "Pro accounts can hide their own shows" on public.events;
create policy "Pro accounts can hide their own shows" on public.events
  for update to authenticated
  using (
    pro_account_id = auth.uid()
    and exists (
      select 1 from public.pro_accounts pa
      where pa.id = auth.uid() and pa.active
    )
  );

-- ===================== 4. Deleting an empty show =====================

-- Exactly the rule an artist gets (addendum_006): you may delete a show only
-- while NOBODY has bought a ticket. Once money has moved, the row is the record
-- of it and removing the show would be destroying that record — from there it is
-- a cancellation, which refunds people and stays with MadGigz.
--
-- Worth having rather than hiding the button: ManageShowModal asks for the
-- deleted rows back, so a delete this policy refuses reports a clean error
-- instead of a false success. But a promoter tidying up a show they mistyped,
-- with nothing sold, is an ordinary thing to want and shouldn't need an email.
drop policy if exists "Pro accounts can delete their own empty shows" on public.events;
create policy "Pro accounts can delete their own empty shows" on public.events
  for delete to authenticated
  using (
    pro_account_id = auth.uid()
    and exists (
      select 1 from public.pro_accounts pa
      where pa.id = auth.uid() and pa.active
    )
    and not exists (select 1 from public.tickets where tickets.event_id = events.id)
  );

-- Not granted, on purpose: INSERT on events. A pro creates shows through /pro,
-- which writes with the service-role client behind requirePro() — so
-- events.pro_account_id stays off the column list addendum_026 grants to
-- authenticated, and nobody can point a show's payout at themselves from the
-- browser. scripts/probe-pro-accounts.mjs asserts exactly that.
