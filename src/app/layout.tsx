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
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0807",
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
