import { describe, expect, it } from "vitest";
import { shouldSeeLegalUpdate, type LegalUpdate } from "./legal-updates";

const artistsOnly: LegalUpdate = {
  id: "test-artists",
  date: "2026-08-21",
  docs: ["organiserTerms"],
  audience: "artists",
};

const everyone: LegalUpdate = { ...artistsOnly, id: "test-all", audience: "everyone" };

describe("shouldSeeLegalUpdate", () => {
  it("shows an organiser-only change to artists", () => {
    expect(shouldSeeLegalUpdate(artistsOnly, "artist", false)).toBe(true);
  });

  // The point of the audience field. A commission change reaching fans invites
  // "did my ticket get more expensive?" about a fee they never pay.
  it("hides an organiser-only change from fans", () => {
    expect(shouldSeeLegalUpdate(artistsOnly, "fan", false)).toBe(false);
  });

  it("hides an organiser-only change from admins, who are staff not organisers", () => {
    expect(shouldSeeLegalUpdate(artistsOnly, "admin", false)).toBe(false);
  });

  it("shows an everyone change to fans", () => {
    expect(shouldSeeLegalUpdate(everyone, "fan", false)).toBe(true);
  });

  // No account means no terms to have changed, and a guest has nowhere to
  // dismiss it to - they'd meet it again on every visit.
  it("never shows anything to a guest", () => {
    expect(shouldSeeLegalUpdate(everyone, "fan", true)).toBe(false);
    expect(shouldSeeLegalUpdate(artistsOnly, "artist", true)).toBe(false);
  });

  it("shows nothing when no update is live", () => {
    expect(shouldSeeLegalUpdate(null, "artist", false)).toBe(false);
  });
});
