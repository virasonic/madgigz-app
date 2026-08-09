# Waiting on Vir

Things only you can do — dashboard access, a decision, or a device. Ordered by
what unblocks the most.

## 1. Add `CRON_SECRET` in Vercel — blocking

Settings → Environment Variables → new variable `CRON_SECRET`, value from
`openssl rand -hex 32` (or 40+ random characters). Redeploy after saving.

Until this exists the nightly purge returns 503 and refuses to run, so account
deletions are accepted and then sit pending forever. Verified: production
returns 503 today.

The `Deletetest` account is currently scheduled for deletion and will be purged
30 days after this is set.

## 2. Run `addendum_020` in the Supabase SQL editor — blocks the new admin form

```sql
alter table public.events
  add column if not exists house_run boolean not null default false;

comment on column public.events.house_run is
  'MadGigz sells these tickets on its own account: no Stripe Connect transfer, no application fee, and refunds do not reverse a transfer. Set only from the admin panel.';

update public.events set house_run = false where house_run is null;
```

The code is already deployed and safe without it — existing shows keep working
and checkout treats a missing column as "not a house show". Only
`/admin/events/new` needs it, and it says so plainly if you try before running.

## 3. Roll the Stripe test keys

They were printed in full in a chat transcript. Test mode, so low stakes, but
worth clearing.

## 4. Add the address for `El Sol` in `/admin/venues`

The last venue without one. Its previous value was wrong — it carried Café
Berlín's address — so it was nulled rather than left looking correct. The real
one is on Calle de los Jardines.

## Decisions — reply whenever

- **Remove the `deleted-da7ab6e6` tombstone** from `/admin/users`? Left there so
  a real purged row is visible. Nothing depends on it.
- **Connect Stripe payouts for Losing The Count and Hard Fuse?** Until they do,
  their shows can only be free or externally ticketed.
- **#63 past events** — what should happen to a show once its date passes? Still
  unscoped, so it can't be planned.
- **#79 email verification link** — parked pending tester feedback. Say so in
  the email, drop the button, or leave it.

## Worth a click when you're next in the app

Built and shipped, but never exercised through the UI:

- **The new admin show form** (`/admin/events` → *New show*), after step 2.
  Two options only: *Sold elsewhere* (link out) or *MadGigz house show* (we sell,
  we keep it, no commission). Try one of each.
- **Account deletion dialog**, sign-in cancellation, and the "your account is
  safe" notice. *(You've now done this — it works.)*

## Known gap in the house-show path

A house show can be created and bought once `addendum_020` is run, but the money
side has never been exercised against Stripe: no house-show purchase has been
made, and no house-show refund has been issued. The code omits the transfer and
the fee, which is the correct shape, but "correct shape" is not "seen it work".

Worth doing before any real house show goes on sale: create a €1 house show,
buy it with test card `4242 4242 4242 4242`, confirm in Stripe that the payment
lands on the platform account with **no application fee and no transfer**, then
cancel the show from the admin panel and confirm the refund succeeds.
