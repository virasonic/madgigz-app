import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/site";

// The app had no robots.txt at all, so crawlers were free to spend their budget
// on sign-in screens and admin routes that redirect them straight back out.
//
// Everything listed here is either behind a session or meaningless without one.
// Note this is crawl guidance, not access control - the real gates are the auth
// checks in each route; blocking /admin here just stops Google wasting requests
// on a redirect, it is not what keeps anyone out.
//
// Kept in step with sitemap.ts: a URL must never be in both.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/api/",
          "/auth/",
          "/checkout",
          "/claim/",
          "/notifications",
          // Login-gated for now (the artist page redirects a guest to sign-in),
          // so it is nothing a crawler can read. Worth revisiting if artist
          // profiles ever open to guests - they would be good landing pages.
          "/profile",
          "/saved",
          "/signin",
          "/signup",
          "/tickets",
        ],
      },
    ],
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
