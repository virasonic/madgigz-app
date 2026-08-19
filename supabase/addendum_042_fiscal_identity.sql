-- Addendum 042: capture an organiser's fiscal identity (#97 capture flow). The
-- lawyer's 13 Aug requirement is that MadGigz collect an organiser's tax info
-- BEFORE releasing payouts: EU-established organisers give a VAT ID (NIF in
-- Spain), non-EU give a government-issued ID. We also need it to raise the
-- monthly commission invoice ("Comisión por intermediación…") through Odoo.
--
-- Stripe Connect collects tax data for STRIPE's own purposes, but MadGigz gets no
-- structured access to it for invoicing, so this is a separate, first-class
-- capture on the profile.
--
-- SENSITIVE fiscal/personal data — deliberately NOT granted to anon or
-- authenticated. public.profiles carries column-level grants (addendum_018), so a
-- newly-added column is service-role-only by default, which is exactly right here
-- (same treatment as stripe_account_id and date_of_birth). The app reads and
-- writes these only through the service-role client, from a server action that
-- re-derives the caller from the session. Nothing public reads them; the artist's
-- own "provided" state is computed server-side, never exposed as a column — so
-- there is NO grant to add here.
--
-- SAFE TO RUN ON A LIVE DB, single phase, additive. Code that ships before this
-- degrades: the fiscal server helper catches the missing-column error (42703) and
-- reports "not provided" rather than throwing. Run on STAGING first, then PROD.

alter table public.profiles
  add column if not exists fiscal_legal_name  text,        -- name/razón social on the invoice
  add column if not exists fiscal_id          text,        -- NIF / VAT ID / gov ID (normalised, upper)
  add column if not exists fiscal_id_type     text,        -- 'nif' | 'vat' | 'other'
  add column if not exists fiscal_country     text,        -- ISO-3166 alpha-2, e.g. 'ES'
  add column if not exists fiscal_address     text,        -- fiscal address (needed for a valid factura)
  add column if not exists fiscal_provided_at timestamptz; -- when the organiser last saved it
