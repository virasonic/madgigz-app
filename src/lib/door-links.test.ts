import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DOOR_LINK_TTL_HOURS,
  canScanEvent,
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

// Who may run a show's door. A stub of the two lookups the rule makes - the
// caller's role and whether a pro account is active - so the rule is pinned
// without a database: an admin may run ANY show's door (24 Nov 2026), an
// artist only their own, a pro only a show it booked, a fan none.
describe("canScanEvent", () => {
  function fakeAdmin(roles: Record<string, string>, activePros: string[]): SupabaseClient {
    const from = (table: string) => ({
      select: () => ({
        eq: (_col: string, id: string) => ({
          maybeSingle: async () => ({
            data:
              table === "profiles"
                ? roles[id]
                  ? { role: roles[id] }
                  : null
                : table === "pro_accounts"
                  ? activePros.includes(id)
                    ? { active: true }
                    : null
                  : null,
          }),
        }),
      }),
    });
    return { from } as unknown as SupabaseClient;
  }
  const admin = fakeAdmin({ adm: "admin", art: "artist", fan: "fan", pro: "fan" }, ["pro"]);
  const artistShow = { artist_id: "art", pro_account_id: null };
  const houseShow = { artist_id: null, pro_account_id: null };
  const proShow = { artist_id: "someone", pro_account_id: "pro" };

  it("lets an admin run the door of any show, not only a house show", async () => {
    expect(await canScanEvent(admin, "adm", houseShow)).toBe(true);
    expect(await canScanEvent(admin, "adm", artistShow)).toBe(true);
    expect(await canScanEvent(admin, "adm", proShow)).toBe(true);
  });

  it("lets the owner artist and the booking pro account, and nobody else", async () => {
    expect(await canScanEvent(admin, "art", artistShow)).toBe(true);
    expect(await canScanEvent(admin, "pro", proShow)).toBe(true);
    expect(await canScanEvent(admin, "art", proShow)).toBe(false);
    expect(await canScanEvent(admin, "fan", artistShow)).toBe(false);
    expect(await canScanEvent(admin, "fan", houseShow)).toBe(false);
  });
});
