import type { MetadataRoute } from "next";

// Makes MadGigz installable to a phone's home screen. "standalone" drops the
// browser chrome so it launches like a native app - which matters here because
// the whole UI is built around a mobile bottom-nav shell that looks wrong
// inside a Safari tab.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MadGigz",
    short_name: "MadGigz",
    description: "Local gigs and concerts in Madrid — discover events, buy tickets, follow artists.",
    start_url: "/feed",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0807",
    theme_color: "#0a0807",
    categories: ["music", "entertainment", "events"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android crops icons to arbitrary shapes; this one keeps the mark inside
      // the safe area so it doesn't get clipped.
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
