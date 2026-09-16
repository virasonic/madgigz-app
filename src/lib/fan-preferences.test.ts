import { describe, expect, it } from "vitest";
import {
  capacityBucket,
  EMPTY_PREFERENCES,
  scoreEvent,
  timeBucket,
  weekdayIndex,
  type FanPreferences,
} from "./fan-preferences";

describe("bucket helpers", () => {
  it("maps time to a bucket on the right side of each boundary", () => {
    expect(timeBucket("17:59")).toBe("afternoon");
    expect(timeBucket("18:00")).toBe("evening");
    expect(timeBucket("21:59")).toBe("evening");
    expect(timeBucket("22:00")).toBe("late");
    expect(timeBucket("23:30")).toBe("late");
    expect(timeBucket(null)).toBeNull();
    expect(timeBucket("")).toBeNull();
  });

  it("maps capacity to a bucket on the right side of each boundary", () => {
    expect(capacityBucket(149)).toBe("small");
    expect(capacityBucket(150)).toBe("medium");
    expect(capacityBucket(500)).toBe("medium");
    expect(capacityBucket(501)).toBe("large");
  });

  it("returns Monday-first weekday indices", () => {
    expect(weekdayIndex("2026-09-14")).toBe(0); // a Monday
    expect(weekdayIndex("2026-09-20")).toBe(6); // a Sunday
  });
});

describe("scoreEvent", () => {
  const event = {
    genreIds: ["rock", "indie"],
    dateIso: "2026-09-18", // Friday -> index 4
    timeStr: "21:00", // evening
    capacity: 120, // small
  };

  it("scores 0 when the fan set nothing", () => {
    expect(scoreEvent(EMPTY_PREFERENCES, event)).toBe(0);
  });

  it("adds one point per matching dimension", () => {
    const prefs: FanPreferences = {
      genreIds: ["indie"],
      weekdays: [4],
      timeBuckets: ["evening"],
      capacityBuckets: ["small"],
    };
    expect(scoreEvent(prefs, event)).toBe(4);
  });

  it("counts only the dimensions that match", () => {
    const prefs: FanPreferences = {
      genreIds: ["jazz"], // no overlap
      weekdays: [4], // match
      timeBuckets: ["late"], // no match (evening)
      capacityBuckets: ["small"], // match
    };
    expect(scoreEvent(prefs, event)).toBe(2);
  });
});
