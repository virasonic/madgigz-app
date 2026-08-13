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
  server: {
    url: "https://madgigz.aurasonic.es",
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
      launchShowDuration: 1000,
      backgroundColor: "#0a0807",
      showSpinner: false,
    },
  },
};

export default config;
