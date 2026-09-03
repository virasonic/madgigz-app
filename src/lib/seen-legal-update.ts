// Which legal-update notice this person has already dismissed.
//
// One string, not a list: only the current update is ever shown, so all that
// matters is whether the id they dismissed is the id that is live now. Bumping
// the id in legal-updates.ts is therefore what re-shows the notice.
//
// localStorage for the same reason as seen-announcements.ts, with the same
// consequence spelled out honestly: it is per device, so somebody who dismisses
// this on their phone sees it again on a laptop. For a NOTICE that is a second
// dismissal, not a problem. It would be a problem if this were ever used as
// proof that somebody saw a change - see the warning in legal-updates.ts.

const KEY = "madgigz_seen_legal_update";

export function getSeenLegalUpdate(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    // Safari private mode throws on access. "Nothing dismissed" is the safe
    // direction for a legal notice: shown again beats never shown.
    return null;
  }
}

export function markLegalUpdateSeen(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, id);
  } catch {
    // Storage blocked or full. The notice reappears next launch, which for
    // this is the right failure.
  }
}
