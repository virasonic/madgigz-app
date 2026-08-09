-- Backlog #62: shows created by MadGigz itself from the admin panel.
--
-- Two kinds, and they need different plumbing:
--
--   External-link shows - MadGigz advertises a gig sold somewhere else
--   (Entradium and friends). ticketing_mode = 'external' already covers this
--   entirely; no money moves through us, so nothing new is needed.
--
--   House shows - MadGigz sells the tickets itself, for its own nights or a
--   band it runs directly. This is the case the payments code cannot express
--   today: checkout looks up the event's artist, demands a connected Stripe
--   account, and splits the money with an application fee. A house show has no
--   artist to pay and no commission to take - the money simply belongs to the
--   platform account.
--
-- Hence an explicit flag rather than inferring it from a null artist_id. "No
-- artist attached" and "MadGigz keeps the money" are different statements, and
-- an admin can perfectly well create an external-link show for an off-platform
-- artist without it becoming a house show.
--
-- Run this in the Supabase SQL editor.

alter table public.events
  add column if not exists house_run boolean not null default false;

comment on column public.events.house_run is
  'MadGigz sells these tickets on its own account: no Stripe Connect transfer, no application fee, and refunds do not reverse a transfer. Set only from the admin panel.';

-- Existing shows are all artist-run. The default covers them, but be explicit
-- so a re-run on a partially-migrated database still lands somewhere sane.
update public.events set house_run = false where house_run is null;
