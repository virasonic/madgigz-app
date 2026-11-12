// "Last active" and "which platform" per user (#228 follow-up).
//
// The analyst export had a `platform` column nothing filled and a
// last_sign_in_date that only moves on a fresh login. This is the signal both
// were missing: once per app open, the signed-in shell tells the server which
// platform it is (ios / android / web) and the server stamps the user's single
// user_activity row. First-party, one row per user, overwritten in place - no
// history, so there is nothing here to be a tracking log.
//
// The device throttles itself to one touch per TOUCH_EVERY_MS so a day of
// navigating costs one request, not one per screen. The stamp is keyed to the
// user so two accounts on one phone each get their own touch.
//
// The key is first-party and purely functional (a timestamp that stops the app
// repeating a request), so it sits with the essential entries in the consent
// banner's text (consent.essentialBody) rather than behind a toggle; the
// server-side row is account data and belongs in the privacy policy.

const KEY = "mg_activity_touch";
const TOUCH_EVERY_MS = 6 * 60 * 60 * 1000;

interface Stamp {
  userId: string;
  at: number;
}

/** True when this user has not been touched from this device in the last 6h. */
export function activityTouchDue(userId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return true;
    const stamp = JSON.parse(raw) as Stamp;
    if (stamp?.userId !== userId || typeof stamp.at !== "number") return true;
    return Date.now() - stamp.at > TOUCH_EVERY_MS;
  } catch {
    // Private mode, blocked storage, or junk left by an older build: touch
    // anyway, it is one cheap upsert.
    return true;
  }
}

/**
 * Remember that a touch was attempted. Stamped on the attempt, not on success:
 * before addendum_066 is run the call fails every time, and retrying it on
 * every page load for nothing is worse than losing six hours of precision on
 * a column that is reported to the day.
 */
export function markActivityTouched(userId: string): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ userId, at: Date.now() } satisfies Stamp));
  } catch {
    // Storage full or blocked: the next load tries again, which is harmless.
  }
}
