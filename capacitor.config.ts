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
