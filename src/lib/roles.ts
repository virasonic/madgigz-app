import { ArtistStatus, Role } from "@/lib/types";
import type { ProAccountType } from "@/lib/pro";

// Roles that get the artist toolset in the app: Add Show, Manage Show, content
// posting, the door scanner, payouts, and a public artist page.
//
// Admin is in here so the MadGigz account can run its own shows without a
// second login. It is a widening of what the *app* allows, not of what the
// database allows - the RLS policies key on artist_status = 'approved' rather
// than on role, so an admin still has to be an approved artist to insert an
// event or a content post. Setting that flag is the deliberate act; this list
// only stops the UI hiding tools the database would have permitted anyway.
export const ARTIST_CAPABLE_ROLES: Role[] = ["artist", "admin"];

export function isArtistRole(role: Role | null | undefined): boolean {
  return !!role && ARTIST_CAPABLE_ROLES.includes(role);
}

// The full gate: artist-capable *and* actually approved. Anything that creates
// or manages a show should use this rather than the role alone.
export function canActAsArtist(
  user: { role: Role; artistStatus: ArtistStatus | null } | null | undefined
): boolean {
  return !!user && isArtistRole(user.role) && user.artistStatus === "approved";
}

// The organiser gate (#88). Promoters, venues and artists are all organisers, so
// anything that means "can run a show" - the door scanner, posting content,
// managing a night - asks this rather than canActAsArtist.
//
// A pro account needs no artist_status: that flag means "this person is the
// act", and it is set by the artist self-claim + review flow. A promoter is
// vetted at a stronger gate instead - MadGigz creates their account by hand in
// /admin/pro - and the database says the same thing, keying its pro policies
// (addendum_052) on an ACTIVE pro_accounts row rather than on artist_status.
export function canActAsOrganiser(
  user:
    | { role: Role; artistStatus: ArtistStatus | null; proType?: ProAccountType | null }
    | null
    | undefined
): boolean {
  if (!user) return false;
  return canActAsArtist(user) || Boolean(user.proType);
}

// What the profile calls this account. Pro accounts outrank the underlying role
// because that role is a leftover - a promoter's login is a 'fan' row with a
// business attached, and labelling them "Fan" is simply wrong.
export function organiserLabel(user: {
  role: Role;
  proType?: ProAccountType | null;
}): string {
  if (user.proType === "venue") return "Venue";
  if (user.proType === "promoter") return "Promoter";
  if (user.role === "admin") return "Admin";
  if (user.role === "artist") return "Artist";
  return "Fan";
}
