// The origin of the request being served - for URLs a user is sent AWAY to and
// then BACK from, i.e. Stripe Checkout / Connect onboarding and door links.
//
// Why not siteOrigin()? That is the canonical host from NEXT_PUBLIC_APP_URL,
// right for link previews and the sitemap. But a Stripe return URL must bring
// the person back to the host they LEFT from: the auth cookie is per-origin, so
// returning them to a different host lands them signed out on the confirmation
// page - and inside the native shell a foreign host is an "external
// navigation" that strands the fan outside the app (#131). While the app is
// served on two hosts (the madgigz.app move, #235) the request host is the only
// value that is right on both.
//
// Server-only: next/headers can't be imported from a client component, which
// is why this isn't in src/lib/site.ts (imported by client code).
import { headers } from "next/headers";
import { siteOrigin } from "@/lib/site";

// Hosts the app is actually served on. Vercel only routes a request to this
// project for a domain attached to it, so the Host header can't name a
// stranger - but a Stripe success_url is a phishing vector if it ever could,
// so the allow-list is cheap insurance, and the fallback is the canonical host.
const ALLOWED_HOST = /^(localhost|127\.0\.0\.1)(:\d+)?$|^([a-z0-9-]+\.)*(madgigz\.app|aurasonic\.es|vercel\.app)$/i;

/** Pure half, for tests: the origin implied by a Host + forwarded-proto pair. */
export function originFromHost(host: string | null, proto: string | null): string | null {
  const h = host?.trim().toLowerCase();
  if (!h || !ALLOWED_HOST.test(h)) return null;
  const local = h.startsWith("localhost") || h.startsWith("127.0.0.1");
  const scheme = local ? (proto === "https" ? "https" : "http") : "https";
  return `${scheme}://${h}`;
}

export async function requestOrigin(): Promise<string> {
  try {
    const h = await headers();
    // Vercel puts the public host in x-forwarded-host; `host` is the fallback
    // for local dev and anything in front of us that doesn't set it.
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const origin = originFromHost(host, h.get("x-forwarded-proto"));
    if (origin) return origin;
  } catch {
    // headers() throws outside a request scope (e.g. a build-time call) - the
    // canonical host is the right answer there anyway.
  }
  return siteOrigin();
}
