import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${galdernExtraBold.variable} ${galdernMedium.variable} ${dmSans.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
