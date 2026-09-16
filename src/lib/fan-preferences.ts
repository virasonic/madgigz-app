// #170: a fan's discovery preferences and the soft-boost scoring that ranks
// matching shows higher on Explore. Pure and framework-free so it can be unit
// tested and shared by the server (Explore ordering) and the client (the
// Preferences screen). All four dimensions are optional; a fan who sets nothing
// scores 0 on every event, so ordering is unchanged.

export type TimeBucket = "afternoon" | "evening" | "late";
export type CapacityBucket = "small" | "medium" | "large";

export interface FanPreferences {
  /** genre ids from the genres table */
  genreIds: string[];
  /** 0 = Monday … 6 = Sunday */
  weekdays: number[];
  timeBuckets: TimeBucket[];
  capacityBuckets: CapacityBucket[];
}

export const EMPTY_PREFERENCES: FanPreferences = {
  genreIds: [],
  weekdays: [],
  timeBuckets: [],
  capacityBuckets: [],
};

export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;
export const TIME_BUCKETS: TimeBucket[] = ["afternoon", "evening", "late"];
export const CAPACITY_BUCKETS: CapacityBucket[] = ["small", "medium", "large"];

/** event_date is a plain YYYY-MM-DD; read it in UTC like the rest of the app,
 *  and return Monday-first (0=Mon … 6=Sun) to match the day labels. */
export function weekdayIndex(dateIso: string): number {
  const jsDay = new Date(`${dateIso}T00:00:00Z`).getUTCDay(); // 0=Sun … 6=Sat
  return (jsDay + 6) % 7;
}

export function timeBucket(timeStr: string | null | undefined): TimeBucket | null {
  if (!timeStr) return null;
  const hour = Number(timeStr.slice(0, 2));
  if (Number.isNaN(hour)) return null;
  if (hour < 18) return "afternoon";
  if (hour < 22) return "evening";
  return "late";
}

export function capacityBucket(capacity: number): CapacityBucket {
  if (capacity < 150) return "small";
  if (capacity <= 500) return "medium";
  return "large";
}

/** +1 for each dimension the fan expressed AND this event matches (genre = any
 *  overlap). Higher = boosted higher on Explore. A soft signal, never a filter. */
export function scoreEvent(
  prefs: FanPreferences,
  event: { genreIds: string[]; dateIso: string; timeStr: string | null; capacity: number }
): number {
  let score = 0;
  if (prefs.genreIds.length > 0 && event.genreIds.some((g) => prefs.genreIds.includes(g))) {
    score += 1;
  }
  if (prefs.weekdays.length > 0 && prefs.weekdays.includes(weekdayIndex(event.dateIso))) {
    score += 1;
  }
  if (prefs.timeBuckets.length > 0) {
    const tb = timeBucket(event.timeStr);
    if (tb && prefs.timeBuckets.includes(tb)) score += 1;
  }
  if (
    prefs.capacityBuckets.length > 0 &&
    prefs.capacityBuckets.includes(capacityBucket(event.capacity))
  ) {
    score += 1;
  }
  return score;
}
