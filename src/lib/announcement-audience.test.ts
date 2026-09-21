import { describe, expect, it } from "vitest";
import { audienceAllows, audienceLabel } from "./announcement-audience";

describe("audienceAllows", () => {
  it("shows an untargeted announcement to everyone", () => {
    expect(audienceAllows(null, false)).toBe(true);
    expect(audienceAllows(null, true)).toBe(true);
    expect(audienceAllows("all", false)).toBe(true);
    expect(audienceAllows(undefined, true)).toBe(true);
  });

  it("hides organiser announcements from fans (and guests)", () => {
    expect(audienceAllows("organisers", false)).toBe(false);
    expect(audienceAllows("organisers", true)).toBe(true);
  });

  it("hides fan announcements from organisers", () => {
    expect(audienceAllows("fans", true)).toBe(false);
    expect(audienceAllows("fans", false)).toBe(true);
  });

  it("treats an unknown value as everyone", () => {
    expect(audienceAllows("something-else", false)).toBe(true);
  });
});

describe("audienceLabel", () => {
  it("labels the known audiences", () => {
    expect(audienceLabel("all")).toBe("Everyone");
    expect(audienceLabel("fans")).toBe("Fans only");
    expect(audienceLabel("organisers")).toBe("Artists & organisers");
  });

  it("falls back to Everyone for null/unknown", () => {
    expect(audienceLabel(null)).toBe("Everyone");
    expect(audienceLabel("nope")).toBe("Everyone");
  });
});
