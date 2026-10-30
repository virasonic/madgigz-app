"use client";

import { useCallback } from "react";
import ScannerView from "@/components/scan/ScannerView";
import LanguageToggle from "@/components/ui/LanguageToggle";
import { doorCheckIn, doorLookup, doorStats } from "./actions";

// The door link's half of the scanner (#218): the same ScannerView as
// /profile/scan, resolving codes through the token-scoped server actions
// instead of the caller's own Supabase session.
export default function DoorScanner({
  token,
  eventId,
  eventTitle,
  eventVenue,
  eventDate,
}: {
  token: string;
  eventId: string;
  eventTitle: string;
  eventVenue: string;
  eventDate: string;
}) {
  const lookup = useCallback((code: string) => doorLookup(token, code), [token]);
  const checkIn = useCallback((ticketId: string) => doorCheckIn(token, ticketId), [token]);
  // The link is already scoped to one show, so the event id the view passes
  // back is the same one - the token decides, not the argument.
  const stats = useCallback(() => doorStats(token), [token]);

  // Dates render en-GB in both locales, by design (see i18n notes).
  const dateLabel = new Date(eventDate).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

  return (
    <ScannerView
      lookup={lookup}
      checkIn={checkIn}
      stats={stats}
      eventId={eventId}
      header={
        <>
          <div className="min-w-0">
            <h1 className="truncate font-display text-2xl text-foreground">{eventTitle}</h1>
            <p className="truncate text-sm text-muted">
              {eventVenue} · {dateLabel}
            </p>
          </div>
          <LanguageToggle className="shrink-0" />
        </>
      }
    />
  );
}
