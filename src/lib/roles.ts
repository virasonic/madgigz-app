import { ArtistStatus, Role } from "@/lib/types";

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
