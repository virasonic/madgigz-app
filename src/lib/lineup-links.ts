// Turning a printed line-up (plain names on events.lineup) into links to real
// MadGigz profiles. An act becomes a link only when its name resolves - matched
// accent-insensitively - to an artist who has an account AND is associated with
// the gig: either a tagged artist (event_artists) or the show's owner. Untagged
// names, and external acts with no account, stay plain text.

export interface TaggedArtist {
  id: string;
  username: string;
  artistName: string | null;
}

// Accent- and case-insensitive, so "Minóica" on the bill matches "Minoica" the
// handle. Mirrors the matcher used for admin tag suggestions.
export function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// normalised act name -> profile id to link it to. Built from the tagged artists
// (by artist name and by handle) plus the show's owner, if any.
export function buildLineupLinks(
  tagged: TaggedArtist[],
  owner: { id: string | null; name: string | null }
): Record<string, string> {
  const map: Record<string, string> = {};
  if (owner.id && owner.name) map[normName(owner.name)] = owner.id;
  for (const a of tagged) {
    if (a.artistName) map[normName(a.artistName)] = a.id;
    if (a.username) map[normName(a.username)] = a.id;
  }
  return map;
}
