import { describe, expect, it } from "vitest";
import {
  DOOR_LINK_TTL_HOURS,
  doorLinkExpiry,
  hashDoorToken,
  isDoorLinksNotReady,
  isDoorTokenShaped,
  mintDoorToken,
} from "./door-links";

// Door links (#218). The pieces that decide whether a leaked link still works
// are pure, so they are pinned here: expiry is bounded by the show's date, the
// token is URL-safe and unguessable in shape, and the stored hash is stable.

describe("doorLinkExpiry", () => {
  it("is TTL hours after midnight UTC at the start of the show's date", () => {
    const exp = doorLinkExpiry("2026-10-31");
    expect(exp.toISOString()).toBe(
      new Date(Date.UTC(2026, 9, 31) + DOOR_LINK_TTL_HOURS * 3600 * 1000).toISOString()
    );
  });

  it("covers a 4am close and dies before the next evening", () => {
    const exp = doorLinkExpiry("2026-10-31").getTime();
    const fourAmNextDay = Date.UTC(2026, 10, 1, 3); // 04:00 Madrid (CET) = 03:00 UTC
    const nextEvening = Date.UTC(2026, 10, 1, 19);
    expect(exp).toBeGreaterThan(fourAmNextDay);
    expect(exp).toBeLessThan(nextEvening);
  });
});

describe("mintDoorToken", () => {
  it("is 32 URL-safe chars and never repeats", () => {
    const a = mintDoorToken();
    const b = mintDoorToken();
    expect(isDoorTokenShaped(a)).toBe(true);
    expect(a).not.toBe(b);
    expect(encodeURIComponent(a)).toBe(a);
  });

  it("rejects anything not token-shaped before the database is asked", () => {
    expect(isDoorTokenShaped("")).toBe(false);
    expect(isDoorTokenShaped("short")).toBe(false);
    expect(isDoorTokenShaped("a".repeat(31) + "/")).toBe(false);
    expect(isDoorTokenShaped("a".repeat(33))).toBe(false);
  });
});

describe("hashDoorToken", () => {
  it("is deterministic sha256 hex, and the token itself never appears in it", () => {
    const token = mintDoorToken();
    const hash = hashDoorToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDoorToken(token)).toBe(hash);
    expect(hash.includes(token)).toBe(false);
  });
});

describe("isDoorLinksNotReady", () => {
  it("recognises the missing-table codes and messages, and nothing else", () => {
    expect(isDoorLinksNotReady({ code: "42P01" })).toBe(true);
    expect(isDoorLinksNotReady({ code: "PGRST205" })).toBe(true);
    expect(isDoorLinksNotReady({ message: 'relation "public.door_links" does not exist' })).toBe(true);
    expect(isDoorLinksNotReady({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isDoorLinksNotReady(null)).toBe(false);
  });
});
