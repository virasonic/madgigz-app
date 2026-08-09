-- Account deletion (backlog #70), self-serve and admin-initiated.
--
-- The shape is forced by the foreign keys. tickets.user_id references
-- profiles(id) ON DELETE CASCADE, and profiles.id references auth.users(id)
-- ON DELETE CASCADE - so deleting the auth user cascades all the way through
-- and takes every ticket that person ever bought with it. Those are AuraSonic's
-- sales records; Spanish commercial books have to be kept for six years, and
-- GDPR art. 17(3)(b) is explicit that a legal retention obligation outranks the
-- right to erasure.
--
-- So a deleted account is scrubbed, not removed. The profile row survives as a
-- tombstone holding nothing personal - it exists only so the tickets have
-- something to point at - and the auth user is neutered rather than deleted,
-- for the same reason.
--
-- Run this in the Supabase SQL editor.

-- Set when someone asks. The account keeps working during the grace period;
-- signing in clears this, which is the whole point of having one. Accidental
-- and regretted deletions are common, and the alternative is rebuilding
-- accounts by hand from support emails.
alter table public.profiles
  add column if not exists deletion_requested_at timestamptz;

-- Set when the purge actually runs. Non-null means "this is a tombstone" - no
-- personal data left, cannot sign in, retained only to anchor the ticket rows.
alter table public.profiles
  add column if not exists deleted_at timestamptz;

-- The purge job scans for due requests, so keep that cheap. Partial: the
-- overwhelming majority of rows have this null forever.
create index if not exists profiles_deletion_requested_at_idx
  on public.profiles (deletion_requested_at)
  where deletion_requested_at is not null;

-- Both columns are readable by the account's owner (to show "deletion pending")
-- and are not personal data, so they join the public grant list from
-- addendum_018. Remember: once a table has column-level grants, new columns
-- are NOT granted automatically - this is exactly the case that comment warned
-- about.
grant select (deletion_requested_at, deleted_at) on public.profiles to anon, authenticated;

comment on column public.profiles.deletion_requested_at is
  'When the account holder (or an admin) asked for deletion. Cleared if they sign in during the 30-day grace period.';
comment on column public.profiles.deleted_at is
  'When the purge ran. The row is a tombstone from this point: no personal data, no sign-in, kept only so tickets (6-year retention) keep a valid foreign key.';
