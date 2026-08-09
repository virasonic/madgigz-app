# Waiting on Vir

Things only you can do — dashboard access, a decision, or a device. Ordered by
what unblocks the most.

## 1. Roll the Stripe test API keys

Your **test-mode secret key** (`sk_test_…`) was printed in full in a chat
transcript. Anyone with that transcript can read and write your Stripe test
data — create test charges, read test customers, list connected accounts. No
real money is reachable, which is why this is not urgent, but it is a live
credential sitting in a log.

Stripe Dashboard → **Developers → API keys** → on the secret key, **Roll key**
(choose "immediately"). Then update `STRIPE_SECRET_KEY` in two places:

- `.env.local` on your machine
- Vercel → Settings → Environment Variables → redeploy

The publishable key needs no action — it is public by design.

Your `STRIPE_WEBHOOK_SECRET` is unaffected; it is a different credential and was
not printed.

## 2. Add the address for `El Sol` in `/admin/venues`

Still empty — I checked, and it is the only active venue without one. Its
previous value was wrong (it carried Café Berlín's address), so it was nulled
rather than left looking correct.

Its postal code is already `28013`, which matches Calle de los Jardines — where
Sala El Sol actually is.

## Worth a click when you're next in the app

Built and shipped, but never exercised through the UI:

- **The new admin show form** (`/admin/events` → *New show*), after step 2.
  Two options only: *Sold elsewhere* (link out) or *MadGigz house show* (we sell,
  we keep it, no commission). Try one of each.
- **The like button on Explore cards.** New, and I could not test it myself —
  it needs a signed-in session, which I have no way to create. Tap a heart in
  Explore, then check the event shows under Tickets → Saved. It should also
  fill in on an artist's profile grid, and match what the reels show.
- **The Add Show form** now leads with a payout notice when you have no payout
  account connected. Worth a look as an artist without one.
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
