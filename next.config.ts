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
      ...(supabaseHostname
        ? [{ protocol: "https" as const, hostname: supabaseHostname }]
        : []),
    ],
  },
};

export default nextConfig;
