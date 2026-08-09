// The app's own origin, for the times a relative path won't do: link-preview
// metadata, and anything handed to Stripe.
//
// Never throws on a missing variable - a module-scope throw takes the whole
// Vercel build down, and the localhost fallback is right for local dev anyway.
// The cost of it being wrong in production is a broken OG image, not an outage.
export function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, "");

  // Set by Vercel on every deployment; the production alias, not the per-deploy
  // hash, so a shared link keeps working after the next push.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}

// Where a shared event link points. One definition, because it is written into
// OG tags, copied to clipboards, and pasted into WhatsApp - three places that
// must not disagree about what an event's URL is.
export function eventPath(eventId: string): string {
  return `/e/${eventId}`;
}

export function absoluteUrl(path: string): string {
  // In the browser the real origin beats anything configured: it keeps preview
  // deployments and localhost sharing links to themselves rather than to prod.
  if (typeof window !== "undefined") return `${window.location.origin}${path}`;
  return `${siteOrigin()}${path}`;
}

// Guards the ?next= round-trip used when a shared link sends a logged-out
// visitor through sign-in. Only same-origin paths survive: anything absolute,
// protocol-relative ("//evil.com") or backslash-escaped ("/\evil.com") is
// dropped, so the parameter can't be used to bounce someone off the site.
export function safeNext(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}
