import type { Metadata } from "next";
import OfflineTicketsClient from "./OfflineTicketsClient";

// Offline ticket wallet (#129). Deliberately OUTSIDE the authed (app) group: it
// makes no auth call and fetches no per-user data on the server, so the rendered
// HTML is identical for everyone and safe for the service worker to cache and
// replay with no network. The actual tickets come from localStorage on the
// client (written by the Saved page while online), so a fan at a venue with no
// signal can still open this page and show their QR.
export const metadata: Metadata = {
  title: "Your tickets — MadGigz",
};

export default function OfflineTicketsPage() {
  return <OfflineTicketsClient />;
}
