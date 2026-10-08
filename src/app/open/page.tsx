import type { Metadata } from "next";
import OpenRedirect from "./OpenRedirect";

// A transient "open the installed app, else fall through to the web app"
// interstitial (#134). The marketing site's "Abrir MadGigz" button points here
// instead of straight at the web, so a visitor who already has the app lands in
// the native app — even from inside Instagram's in-app browser, where Universal
// Links can't hand off but the madgigz:// scheme prompt still can.
//
// Not a page anyone should reach from search, and the ?next= round-trip would
// otherwise spawn index noise — so noindex it.
export const metadata: Metadata = {
  title: "Abrir MadGigz",
  robots: { index: false, follow: false },
};

export default function OpenAppPage() {
  return <OpenRedirect />;
}
