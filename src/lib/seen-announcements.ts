// Which MadGigz announcements this person has already scrolled past.
//
// Deliberately localStorage rather than a database table. It decides ordering
// on one pane of one screen: getting it wrong shows somebody a card they have
// already read, which costs a swipe. A table would mean a row per person per
// announcement, a migration, RLS policies and a write on every scroll - real
// infrastructure for a cosmetic outcome. The trade-off is that it is per
// device, so signing in on a phone after reading on a laptop starts over.
// Revisit if announcements ever become something people must not miss.

const KEY = "madgigz_seen_announcements";

export function getSeenAnnouncements(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    // A corrupt or unavailable store (Safari private mode throws) means
    // "nothing seen yet", which is the safe direction: the person sees the
    // cards again rather than never seeing them.
    return [];
  }
}

export function markAnnouncementSeen(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const seen = getSeenAnnouncements();
    if (seen.includes(id)) return;
    // Capped so this can't grow without bound over years of announcements.
    // Oldest entries fall off first; if one ever resurfaces, it is one card.
    const next = [...seen, id].slice(-200);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked - not worth surfacing for this.
  }
}
