// Intercepts /event/yyyy/mm/dd/<slug> for soft navigations made inside the app
// shell (#237). It deliberately renders nothing.
//
// What it is for: the ticket sheet opens by pushing the show's own URL - the
// same one the Share button hands out - instead of ?ticket=<uuid>. Pushing a
// path through the router needs a route to land on, and because this one
// lives in a parallel slot, landing here leaves the `children` slot (Explore,
// Feed, Saved, a profile) exactly as it was: mounted, scrolled, with its own
// state. That screen notices the pathname and renders TicketModal from the
// events it already holds (src/lib/useEventSheet.ts). A hard load of the same
// URL is not intercepted and gets the full public page at src/app/event/....
//
// Why go through the router at all rather than history.pushState: a Server
// Action posts to the router's current URL, and when it revalidates, the
// client navigates there. With this route in place that navigation is the
// intercepted one and the screen underneath survives; without it, the pretty
// URL would resolve to the public page and replace the screen mid-purchase.
export default function InterceptedEventPage() {
  return null;
}
