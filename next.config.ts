import type { NextConfig } from "next";

const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  experimental: {
    // Every app page is dynamic, and dynamic segments aren't client-cached at
    // all by default - so flipping between bottom-nav tabs re-fetched from the
    // server on every single tap. A 30s window makes revisits instant; feed
    // data half a minute old is an acceptable trade for that.
    staleTimes: {
      dynamic: 30,
    },
  },
  // #110: the service worker must be served as JavaScript and never cached, so
  // an update ships immediately instead of clients pinning an old worker.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
      // Storage images are served from whatever host the project used when they
      // were uploaded. After the #122 custom-domain switch the DB holds a mix:
      // older rows under <ref>.supabase.co, newer ones under the custom domain
      // (auth.aurasonic.es). BOTH must be allow-listed or the pre-cutover
      // posters 400 through next/image and render broken. The wildcard covers
      // any project ref (prod's old host + staging's own), and the env-derived
      // host adds the custom domain on top.
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      // The importer (#118) now re-hosts posters onto our own event-media
      // bucket (rehost-poster.ts), so imported posters normally resolve as
      // Supabase URLs above. This entry is the FALLBACK: if a re-host fetch
      // fails we keep the original Bandsintown URL, and it must render.
      {
        protocol: "https",
        hostname: "**.bandsintown.com",
      },
      ...(supabaseHostname
        ? [{ protocol: "https" as const, hostname: supabaseHostname }]
        : []),
    ],
  },
};

export default nextConfig;
