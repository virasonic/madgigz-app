// Apple App Site Association for iOS Universal Links (#134). When the app's
// full App ID is set, iOS treats links to this domain for the listed paths as
// "open the app, not Safari" — so the email-confirm link lands in-app (session
// arrives in the app's webview, no signup password re-entry), and shared gig
// links open the app too. Served at exactly /.well-known/apple-app-site-association
// as application/json, NO redirect and NO .json extension — Apple's fetcher is
// strict about all three.
//
// Gated on env so it goes live the moment the value is set, no code change:
//   APPLE_APP_ID   the full App ID = <TeamID>.<bundleId>,
//                  e.g. ABCDE12345.es.aurasonic.madgigz
// Until it's set the file returns empty `details`, which simply means "this
// domain claims no app yet" — completely inert, safe to ship ahead of the build
// that adds the Associated Domains entitlement. Read at request time (not baked
// at build) so setting the env var takes effect on the next request.
//
// Claimed paths are deliberately specific (not "/") so only these deep-link into
// the app; everything else keeps opening normally:
//   /auth/confirm   — email verification link (the point of #134)
//   /auth/callback  — OAuth return
//   /e/*            — shared public event links
export const dynamic = "force-dynamic";

export function GET() {
  const appId = process.env.APPLE_APP_ID?.trim();

  const body = {
    applinks: {
      apps: [],
      details: appId
        ? [
            {
              appIDs: [appId],
              components: [
                { "/": "/auth/confirm", comment: "email verification link opens the app" },
                { "/": "/auth/callback", comment: "OAuth return opens the app" },
                { "/": "/e/*", comment: "shared event links open the app" },
              ],
            },
          ]
        : [],
    },
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
