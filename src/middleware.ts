import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Shared-password gate for Preview deployments only (#227). This replaces
// Vercel's own "Vercel Authentication" wall - which forces every visitor onto
// the Vercel team - with a single shared password, so coworkers can open the
// staging URL without a Vercel account.
//
// It runs ONLY when VERCEL_ENV === "preview": production (VERCEL_ENV ===
// "production") and local dev (undefined) are never gated, so prod is wholly
// untouched. It fails OPEN when no password is configured, so turning the
// feature on is safe in any order - the code can ship before STAGING_SHARED_
// PASSWORD exists, and nobody is locked out in between. This is a convenience
// gate over test data, not a security boundary; the real protection on the
// staging DB is RLS, exactly as on prod.
function stagingPasswordGate(request: NextRequest): NextResponse | null {
  if (process.env.VERCEL_ENV !== "preview") return null;
  const password = process.env.STAGING_SHARED_PASSWORD;
  if (!password) return null;

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    try {
      // "Basic base64(user:pass)" - the username is ignored, any value works,
      // so coworkers only have to remember the one password.
      const decoded = atob(header.slice(6));
      const supplied = decoded.slice(decoded.indexOf(":") + 1);
      if (supplied === password) return null;
    } catch {
      // Malformed header - fall through and re-prompt.
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="MadGigz staging", charset="UTF-8"' },
  });
}

export async function middleware(request: NextRequest) {
  // Gate first: an unauthenticated browser short-circuits below before any
  // Supabase work, so the password check has to come ahead of that.
  const gate = stagingPasswordGate(request);
  if (gate) return gate;

  // This middleware exists to refresh auth tokens, and that's a network call
  // to Supabase on every matched request. With no auth cookies there's nothing
  // to refresh - visitors who aren't signed in (and crawlers) skip the
  // round-trip entirely.
  const hasAuthCookie = request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-"));
  if (!hasAuthCookie) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refreshes the auth token - keep this call between createServerClient and
  // returning the response, nothing else in between.
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  // api/stripe/webhook and api/cron are excluded deliberately: they're called
  // by Stripe and by Vercel Cron, not by a signed-in browser, so a Supabase
  // auth round-trip per call is pure overhead - and the cookie rewriting this
  // middleware does has no business touching a machine-to-machine request that
  // carries its own credential.
  matcher: [
    "/((?!api/stripe/webhook|api/cron|api/health|sw.js|offline.html|manifest.webmanifest|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
