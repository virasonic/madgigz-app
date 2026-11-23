import { describe, expect, it } from "vitest";
import { eventJsonLd, jsonLdScript, madridIso } from "./event-jsonld";
import type { EventItem } from "./types";

const base: EventItem = {
  id: "e1",
  artistId: "a1",
  proAccountId: null,
  venueId: "v1",
  slug: "doi-losing-the-count",
  title: "DOI + Losing The Count",
  artist: "DOI",
  venue: "Entre Darts Rock",
  venueAddress: "Av. de Oporto, 40",
  city: "Madrid",
  date: "2026-12-18",
  time: "21:00",
  price: 8,
  currency: "EUR",
  accentColor: "#d76616",
  category: "Live Music",
  image: "https://cdn.example/poster.jpg",
  capacity: 100,
  sold: 10,
  description: "Doors 21:00.",
  lineup: ["DOI", "Losing The Count"],
  doors: "20:30",
  ageRestriction: "18+",
  rating: 0,
  active: true,
  cancelled: false,
  featured: false,
  publishAt: null,
  guestCheckout: false,
  maxPerOrder: 6,
  ticketing: undefined,
};

describe("madridIso", () => {
  it("stamps the winter offset", () => {
    expect(madridIso("2026-12-18", "21:00")).toBe("2026-12-18T21:00:00+01:00");
  });
  it("stamps the summer offset", () => {
    expect(madridIso("2026-07-04", "22:30")).toBe("2026-07-04T22:30:00+02:00");
  });
  it("pads a single-digit hour", () => {
    expect(madridIso("2026-12-18", "9:15")).toBe("2026-12-18T09:15:00+01:00");
  });
  it("returns null on junk", () => {
    expect(madridIso("soon", "21:00")).toBeNull();
    expect(madridIso("2026-12-18", "evening")).toBeNull();
  });
});

describe("eventJsonLd", () => {
  const url = "https://madgigz.app/event/2026/12/18/doi-losing-the-count";

  it("emits the required Event fields with a Madrid-offset start", () => {
    const ld = eventJsonLd({ event: base, url, performers: [], organiser: null, soldOut: false });
    expect(ld["@type"]).toBe("MusicEvent");
    expect(ld.name).toBe(base.title);
    expect(ld.startDate).toBe("2026-12-18T21:00:00+01:00");
    expect(ld.doorTime).toBe("2026-12-18T20:30:00+01:00");
    expect(ld.location).toEqual({
      "@type": "Place",
      name: "Entre Darts Rock",
      address: {
        "@type": "PostalAddress",
        streetAddress: "Av. de Oporto, 40",
        addressLocality: "Madrid",
        addressCountry: "ES",
      },
    });
    expect(ld.eventStatus).toBe("https://schema.org/EventScheduled");
    expect(ld.image).toEqual([base.image]);
  });

  it("prices the offer in EUR on the page itself for MadGigz-sold shows", () => {
    const ld = eventJsonLd({ event: base, url, performers: [], organiser: null, soldOut: false });
    expect(ld.offers).toEqual({
      "@type": "Offer",
      url,
      price: "8.00",
      priceCurrency: "EUR",
      availability: "https://schema.org/InStock",
    });
    expect(ld.isAccessibleForFree).toBe(false);
  });

  it("points the offer at the external seller when ticketing is external", () => {
    const ld = eventJsonLd({
      event: { ...base, ticketing: { mode: "external", url: "https://seller.example/x" } },
      url,
      performers: [],
      organiser: null,
      soldOut: false,
    });
    expect(ld.offers.url).toBe("https://seller.example/x");
  });

  it("marks sold out, cancelled and free", () => {
    expect(
      eventJsonLd({ event: base, url, performers: [], organiser: null, soldOut: true }).offers
        .availability
    ).toBe("https://schema.org/SoldOut");
    const cancelled = eventJsonLd({
      event: { ...base, cancelled: true },
      url,
      performers: [],
      organiser: null,
      soldOut: false,
    });
    expect(cancelled.eventStatus).toBe("https://schema.org/EventCancelled");
    expect(cancelled.offers.availability).toBe("https://schema.org/Discontinued");
    expect(
      eventJsonLd({ event: { ...base, price: 0 }, url, performers: [], organiser: null, soldOut: false })
        .isAccessibleForFree
    ).toBe(true);
  });

  it("lists performers and organiser, with urls only where known", () => {
    const ld = eventJsonLd({
      event: base,
      url,
      performers: [{ name: "DOI", url: "https://madgigz.app/profile/a1" }, { name: "Losing The Count" }],
      organiser: { name: "Entre Darts Rock", url: "https://madgigz.app/profile/p1" },
      soldOut: false,
    });
    expect(ld.performer).toEqual([
      { "@type": "MusicGroup", name: "DOI", url: "https://madgigz.app/profile/a1" },
      { "@type": "MusicGroup", name: "Losing The Count" },
    ]);
    expect(ld.organizer).toEqual({
      "@type": "Organization",
      name: "Entre Darts Rock",
      url: "https://madgigz.app/profile/p1",
    });
  });

  it("omits optional fields that are empty", () => {
    const ld = eventJsonLd({
      event: { ...base, venueAddress: null, image: "", description: "" },
      url,
      performers: [],
      organiser: null,
      soldOut: false,
    });
    expect(ld.location.address).not.toHaveProperty("streetAddress");
    expect(ld).not.toHaveProperty("image");
    expect(ld).not.toHaveProperty("description");
    expect(ld).not.toHaveProperty("performer");
    expect(ld).not.toHaveProperty("organizer");
  });
});

describe("jsonLdScript", () => {
  it("escapes < so a title cannot close the script tag", () => {
    const s = jsonLdScript({ name: "</script><img src=x>" });
    expect(s).not.toContain("</script>");
    expect(JSON.parse(s).name).toBe("</script><img src=x>");
  });
});
