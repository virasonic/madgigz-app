import { Capacitor } from "@capacitor/core";
import { createClient } from "@/lib/supabase/client";

/** True only inside the Capacitor native shell (iOS), false on the plain web. */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

// The custom URL scheme the iOS app registers (Info.plist CFBundleURLTypes). The
// exact string must ALSO be allow-listed in Supabase -> Auth -> URL Configuration
// -> Redirect URLs, or the round trip lands nowhere.
export const NATIVE_AUTH_REDIRECT = "madgigz://auth-callback";

type OAuthProvider = "google" | "apple";

/**
 * Starts a social sign-in, branching on where we're running.
 *
 * Web: unchanged - a full-page redirect to the provider that returns to
 * /auth/callback.
 *
 * Native: a WKWebView can't render Google's consent page - Google refuses
 * embedded webviews with `disallowed_useragent`. So the consent step is opened
 * in the system browser (ASWebAuthenticationSession) and the provider redirects
 * to our custom-scheme deep link. `NativeBridge` catches that link and forwards
 * it to the real /auth/callback INSIDE the webview, where the existing server
 * route exchanges the code - the PKCE verifier cookie was written here, in the
 * same webview, so it's present for the exchange - and does all the post-login
 * routing. That's why the native path can reuse the web callback wholesale
 * instead of re-implementing the profile checks.
 *
 * Returns null once the flow has started, or a message to surface on failure.
 */
export async function startOAuth(
  provider: OAuthProvider,
  webRedirectTo: string,
  query: string
): Promise<string | null> {
  const supabase = createClient();

  if (!isNativeApp()) {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: webRedirectTo },
    });
    return error ? error.message : null;
  }

  const redirectTo = query ? `${NATIVE_AUTH_REDIRECT}?${query}` : NATIVE_AUTH_REDIRECT;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { skipBrowserRedirect: true, redirectTo },
  });
  if (error || !data?.url) return error?.message ?? "Couldn't start sign-in.";

  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url: data.url });
  return null;
}
