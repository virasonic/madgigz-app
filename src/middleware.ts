import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
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
    "/((?!api/stripe/webhook|api/cron|api/health|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
