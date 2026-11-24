import { BRAND_SOCIAL_URLS } from "@/lib/brand";

// Site-level structured data for the home page (#239): who MadGigz is, as one
// entity. Until this existed the only `Organization` Google ever saw from us
// was the organiser inside each event block, which names the promoter or the
// act - never the brand. `sameAs` ties the Instagram account to the domain so
// a search for the handle and a search for the app resolve to the same thing.
//
// Pure: takes the origin rather than reading it, so it can be unit-tested.

export type SiteJsonLdInput = {
  /** The site's absolute origin, no trailing slash (siteOrigin()). */
  origin: string;
  /** One-line description in the page's language. */
  description: string;
  /** BCP-47 tag of the language the page renders in. */
  language: string;
};

export function siteJsonLd({ origin, description, language }: SiteJsonLdInput) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${origin}/#organization`,
        name: "MadGigz",
        url: origin,
        // A square, opaque logo is what Google's Organization guide asks for;
        // the maskable 512 icon is exactly that.
        logo: `${origin}/icons/icon-512.png`,
        description,
        ...(BRAND_SOCIAL_URLS.length > 0 ? { sameAs: [...BRAND_SOCIAL_URLS] } : {}),
      },
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        name: "MadGigz",
        url: origin,
        inLanguage: language,
        publisher: { "@id": `${origin}/#organization` },
      },
    ],
  };
}
