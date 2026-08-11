import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { LocaleProvider } from "@/lib/i18n/LocaleProvider";
import { getLocale } from "@/lib/i18n/server";
import { StripeModeProvider } from "@/lib/stripe-mode";
import ServiceWorkerRegistrar from "@/components/pwa/ServiceWorkerRegistrar";

const galdernExtraBold = localFont({
  src: "./fonts/Galdern-ExtraBold.otf",
  variable: "--font-galdern-extrabold",
  display: "swap",
});

const galdernMedium = localFont({
  src: "./fonts/Galdern-Medium.otf",
  variable: "--font-galdern-medium",
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MadGigz",
  description: "Local Gigs & Concerts",
  applicationName: "MadGigz",
  icons: {
    icon: "/favicon.ico",
    // iOS ignores the manifest's icons for the home screen and uses this one.
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "MadGigz",
    // The app canvas is near-black, so a light status bar keeps the clock and
    // battery readable once the browser chrome is gone.
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0807",
  // Lets the layout extend under the notch and home indicator; the safe-area
  // insets in globals.css keep content clear of both.
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  // Server-only env, read here so the whole app can show a soft-launch payment
  // notice. Falls to false (live) if the key is anything but sk_test.
  const stripeTestMode = process.env.STRIPE_SECRET_KEY?.startsWith("sk_test") ?? false;
  return (
    <html
      lang={locale}
      className={`${galdernExtraBold.variable} ${galdernMedium.variable} ${dmSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <LocaleProvider locale={locale}>
          <StripeModeProvider testMode={stripeTestMode}>{children}</StripeModeProvider>
        </LocaleProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
