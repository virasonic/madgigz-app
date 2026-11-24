import { describe, expect, it } from "vitest";
import { siteJsonLd } from "./site-jsonld";
import { BRAND_SOCIAL_URLS } from "./brand";

describe("siteJsonLd", () => {
  const graph = siteJsonLd({
    origin: "https://madgigz.app",
    description: "Conciertos en Madrid.",
    language: "es",
  });

  // The graph is a union of two shapes; index into it as plain records here
  // rather than narrow it, the assertions are the narrowing.
  const [org, site] = graph["@graph"] as Record<string, unknown>[];

  it("emits one Organization and one WebSite that reference each other", () => {
    expect(org["@type"]).toBe("Organization");
    expect(org["@id"]).toBe("https://madgigz.app/#organization");
    expect(org.url).toBe("https://madgigz.app");
    expect(org.logo).toBe("https://madgigz.app/icons/icon-512.png");
    expect(site["@type"]).toBe("WebSite");
    expect(site.publisher).toEqual({ "@id": "https://madgigz.app/#organization" });
    expect(site.inLanguage).toBe("es");
  });

  it("ties the brand's social accounts in via sameAs", () => {
    expect(org.sameAs).toEqual([...BRAND_SOCIAL_URLS]);
    expect(org.sameAs).toContain("https://www.instagram.com/madgigzzz");
  });
});
