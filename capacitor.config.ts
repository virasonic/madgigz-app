import type { CapacitorConfig } from "@capacitor/cli";

// MadGigz is a server-rendered Next app, so there's nothing static to bundle -
// the native shell loads the live site over HTTPS (server.url). `webDir` is only
// the offline fallback shown if the site is unreachable at launch.
//
// appId must match the App ID (bundle identifier) registered in the Apple
// Developer portal, and is DISTINCT from the `es.aurasonic.madgigz.web` Services
// ID that Sign in with Apple uses. Confirm/adjust before `cap add ios`.
const config: CapacitorConfig = {
  appId: "es.aurasonic.madgigz",
  appName: "MadGigz",
  webDir: "capacitor-shell",
  // The WKWebView's own canvas colour, shown for the instant between the splash
  // hiding and the first web paint. Match the app's near-black so there is never
  // a white or black flash there.
  backgroundColor: "#0a0807",
  ios: { backgroundColor: "#0a0807" },
  android: { backgroundColor: "#0a0807" },
  server: {
    url: "https://madgigz.aurasonic.es",
    // Shown when the remote URL can't load - i.e. a no-connection cold launch.
    // Without this, a failed load leaves the WKWebView on its own blank error
    // instead of our shell, so the app "doesn't open" offline. On iOS this page
    // keeps Capacitor plugin access (the no-plugins caveat is Android-only), so
    // capacitor-shell/index.html can read the offline tickets from Preferences
    // and render them (#129, native half).
    errorPath: "index.html",
    // Third-party domains the WKWebView may navigate to IN-APP instead of kicking
    // out to Safari. Stripe Checkout + Connect onboarding live here: without this
    // the pay screen opens in the system browser and the post-payment return URL
    // lands in Safari, stranding the fan outside the app (#131). Test-mode 3-D
    // Secure also stays on *.stripe.com. External ticket links are handled
    // separately - an in-app browser sheet, see `openExternal` in src/lib/native.ts.
    allowNavigation: ["*.stripe.com"],
  },
  plugins: {
    SplashScreen: {
      // DON'T auto-hide on a timer. This is a remote-URL shell, so first paint
      // depends on the network + SSR + auth and regularly takes longer than any
      // fixed duration — a timer hides the native splash while the WebView is
      // still blank, which is the "black between the two logos" gap. Instead the
      // web app hands off explicitly: NativeBridge calls SplashScreen.hide() once
      // React is up (by then the SSR'd BootSplash mark has already painted), so
      // the native splash lifts straight onto the web splash with no black frame.
      // The offline fallback (capacitor-shell/index.html) also calls hide(), so a
      // no-network launch can't leave the splash stuck.
      launchAutoHide: false,
      backgroundColor: "#0a0807",
      showSpinner: false,
    },
  },
};

export default config;
