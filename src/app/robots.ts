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
          // The /pro back-office panel is login-gated; crawlers get nothing.
          "/pro",
          // NOTE: /profile is intentionally NOT blocked. Public artist/venue
          // profiles opened to guests in #196 (/profile/<username>), so they are
          // real, crawlable landing pages for act and venue names and are listed
          // in the sitemap. The private own-profile view at the bare /profile
          // still redirects a guest to sign-in, which is a harmless soft gate.
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
