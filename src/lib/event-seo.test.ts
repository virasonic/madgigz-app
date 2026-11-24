import { describe, expect, it } from "vitest";
import { clockTime, eventSeoDescription, eventSeoTitle, formatPrice } from "./event-seo";
import { getMessages, translate, type Locale } from "./i18n/config";
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
  time: "21:00:00",
  price: 8,
  currency: "EUR",
  accentColor: "#d76616",
  category: "Live Music",
  image: "",
  capacity: 100,
  sold: 10,
  description: "",
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

// The real catalogs, so a reworded string shows up here rather than in Google.
function tFor(locale: Locale) {
  const messages = getMessages(locale);
  return (key: string, vars?: Record<string, string | number>) => translate(messages, key, vars);
}

describe("eventSeoTitle", () => {
  it("leads with the act, venue, city and date in Spanish", () => {
    const title = eventSeoTitle({ event: base, genres: [], locale: "es", t: tFor("es") });
    expect(title).toBe("DOI en Entre Darts Rock, Madrid · vie, 18 dic · Entradas");
  });

  it("does the same in English", () => {
    const title = eventSeoTitle({ event: base, genres: [], locale: "en", t: tFor("en") });
    expect(title).toBe("DOI at Entre Darts Rock, Madrid · Fri 18 Dec · Tickets");
  });
});

describe("eventSeoDescription", () => {
  it("names the line-up, the when, the genre and the price", () => {
    const d = eventSeoDescription({ event: base, genres: ["Punk", "Hardcore", "Metal"], locale: "es", t: tFor("es") });
    expect(d).toBe(
      "DOI + Losing The Count en directo en Entre Darts Rock (Madrid), el viernes, 18 de diciembre a las 21:00. Punk, Hardcore. Entradas desde 8 € en MadGigz."
    );
  });

  it("falls back to the headline act when there is no line-up, and skips the genre sentence", () => {
    const d = eventSeoDescription({ event: { ...base, lineup: [] }, genres: [], locale: "en", t: tFor("en") });
    expect(d).toBe("DOI live at Entre Darts Rock (Madrid) on Friday 18 December at 21:00. Tickets from €8 on MadGigz.");
  });

  it("says free entry on a €0 show", () => {
    const d = eventSeoDescription({ event: { ...base, price: 0 }, genres: [], locale: "es", t: tFor("es") });
    expect(d.endsWith("Entrada gratis.")).toBe(true);
  });

  it("does not promise tickets on MadGigz for an externally-ticketed show", () => {
    const d = eventSeoDescription({
      event: { ...base, price: 12.5, ticketing: { mode: "external", url: "https://seller.example" } },
      genres: [],
      locale: "en",
      t: tFor("en"),
    });
    expect(d.endsWith("Tickets from €12.50.")).toBe(true);
    expect(d).not.toContain("on MadGigz");
  });

  it("caps a long bill at three acts", () => {
    const d = eventSeoDescription({
      event: { ...base, lineup: ["A", "B", "C", "D", "E"] },
      genres: [],
      locale: "en",
      t: tFor("en"),
    });
    expect(d.startsWith("A + B + C + … live at")).toBe(true);
  });
});

describe("formatPrice", () => {
  it("uses the language's currency convention", () => {
    expect(formatPrice(8, "es")).toBe("8 €");
    expect(formatPrice(12.5, "es")).toBe("12,50 €");
    expect(formatPrice(8, "en")).toBe("€8");
    expect(formatPrice(12.5, "en")).toBe("€12.50");
  });
});

describe("clockTime", () => {
  it("drops the seconds Postgres adds and pads the hour", () => {
    expect(clockTime("21:00:00")).toBe("21:00");
    expect(clockTime("9:30")).toBe("09:30");
    expect(clockTime("tbc")).toBe("tbc");
  });
});
