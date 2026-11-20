// The door's guest list: who holds a ticket for a show, so the person on the
// door can find someone whose phone died (or who never got the email) and
// check them in by hand. One shape for both scanners - the organiser's own
// /profile/scan (tickets read through RLS) and the token-scoped /door/<token>
// (a server action with the service-role client) - because it is one list.
//
// Deliberately narrow: a door link is held by an anonymous phone, so this is
// the ticket, who it's for, the seat and the type. No price, no email, no id
// of the buyer - the username is what the door needs to say "yes, that's me".
export interface GuestEntry {
  ticketId: string;
  /** The buyer's MadGigz username - what the fan tells the door. */
  username: string;
  /** People on this ticket row (1 since #150 split rows per seat; older rows may carry more). */
  quantity: number;
  /** Seat number within the order (#150), null on pre-split rows. */
  seat: number | null;
  /** The price tier the seat was bought at (#151), null for single-price shows. */
  tierName: string | null;
  checkedInAt: string | null;
}

// Usernames are [A-Za-z0-9._-]; the door may type "@name" or "Name " from
// hearing it, so the match is case-insensitive, trimmed, and ignores a leading @.
function normalise(query: string): string {
  return query.trim().replace(/^@+/, "").toLowerCase();
}

/** Guests whose username contains the query; everyone when the query is blank. */
export function filterGuests(guests: GuestEntry[], query: string): GuestEntry[] {
  const q = normalise(query);
  if (!q) return guests;
  return guests.filter((g) => g.username.toLowerCase().includes(q));
}

/**
 * Alphabetical by username, then by seat, so a group's tickets sit together
 * under one name. Not "unchecked first": a list that reorders under the
 * door's thumb the moment they tap Check in is worse than a stable one.
 */
export function sortGuests(guests: GuestEntry[]): GuestEntry[] {
  return [...guests].sort(
    (a, b) =>
      a.username.localeCompare(b.username, undefined, { sensitivity: "base" }) ||
      (a.seat ?? 0) - (b.seat ?? 0) ||
      a.ticketId.localeCompare(b.ticketId)
  );
}

/** A show the logged-in scanner can open the guest list for, before any scan. */
export interface ScanEventOption {
  id: string;
  title: string;
  venue: string;
  /** YYYY-MM-DD */
  date: string;
}
