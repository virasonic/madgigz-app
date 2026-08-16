// MadGigz service worker (#110 PWA groundwork).
//
// Deliberately conservative: this is a live, authenticated app, so it must never
// serve one person a page cached for another. The rules:
//   - Cross-origin (Supabase, Stripe, images): ignored entirely - the browser
//     handles them normally, nothing is intercepted or cached.
//   - Page navigations: network-first, and ONLY fall back to a static offline
//     page when the network is gone. HTML is never written to the cache.
//   - Immutable, content-hashed assets (/_next/static, /icons): cache-first,
//     since their URL changes whenever their content does.
//   - Everything else same-origin (API routes, actions): straight to network.
//
// The one job this adds beyond installability is a graceful offline screen.

const CACHE = "madgigz-v1";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never touch cross-origin: Supabase reads/writes, Stripe, remote images.
  if (url.origin !== self.location.origin) return;

  // The offline ticket wallet (#129). Unlike the rest of the app this route is
  // NOT per-user HTML — it fetches nothing on the server and reads the ticket
  // data from localStorage on the client — so it is safe to cache and replay
  // with no network. Network-first (so it updates when online) with a cache
  // fallback, which is what makes a ticket openable at a signal-dead venue.
  if (url.pathname === "/tickets") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        // ignoreVary: the warming fetch() and a real navigation send different
        // headers (RSC/router hints), and Next may echo them in Vary — without
        // this the offline navigation wouldn't match the cached copy.
        .catch(() =>
          caches
            .match(request, { ignoreVary: true })
            .then((cached) => cached || caches.match(OFFLINE_URL))
        )
    );
    return;
  }

  // Page loads: try the network, fall back to the offline page only if offline.
  // The live HTML is never cached (it is per-user and dynamic).
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Content-hashed static assets are safe to cache forever.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return response;
          })
      )
    );
    return;
  }

  // Everything else (API routes, server actions): let the network handle it.
});
