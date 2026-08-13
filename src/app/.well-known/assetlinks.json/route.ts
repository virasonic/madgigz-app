// Digital Asset Links for the Android TWA (#110). When the app's package name and
// signing SHA-256 fingerprint(s) are set, Android verifies MadGigz owns this domain
// and drops the browser URL bar in the installed app. Served at exactly
// /.well-known/assetlinks.json as application/json, no redirect — Google's fetcher
// is strict about that.
//
// Gated on env so it goes live the moment the values are set, no code change:
//   ANDROID_PACKAGE_NAME        e.g. es.aurasonic.madgigz
//   ANDROID_CERT_FINGERPRINTS   one or more SHA-256 fingerprints, comma-separated
//                               (Play App Signing gives one, the upload key another —
//                               include both). Colons and case don't matter.
// Until both are set it returns an empty array, which simply means "not yet verified".
// Read at request time (not baked at build) so setting the env vars takes effect on
// the next request without a code change.
export const dynamic = "force-dynamic";

export function GET() {
  const packageName = process.env.ANDROID_PACKAGE_NAME?.trim();
  const fingerprints = (process.env.ANDROID_CERT_FINGERPRINTS ?? "")
    .split(",")
    .map((f) => f.trim().toUpperCase())
    .filter(Boolean);

  const body =
    packageName && fingerprints.length > 0
      ? [
          {
            relation: ["delegate_permission/common.handle_all_urls"],
            target: {
              namespace: "android_app",
              package_name: packageName,
              sha256_cert_fingerprints: fingerprints,
            },
          },
        ]
      : [];

  return new Response(JSON.stringify(body, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
