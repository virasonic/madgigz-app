// Whether this person has dismissed the "add an intro reel" nudge (#143).
//
// A single boolean, not an id like seen-legal-update: there is only ever one
// intro nudge, and once they add a reel the server stops mounting it anyway
// (the audience check in the app layout), so all that needs remembering is a
// prior dismissal. localStorage, so it is per device - dismissing on a phone
// and seeing it once more on a laptop is fine for a nudge (same trade as
// seen-legal-update.ts / seen-announcements.ts).

const KEY = "madgigz_seen_intro_nudge";

export function getIntroNudgeSeen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    // Private mode throws on access. "Not dismissed" just means it shows once
    // more, which is the harmless direction for a nudge.
    return false;
  }
}

export function markIntroNudgeSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    // Storage blocked or full - it reappears next launch, no harm done.
  }
}
