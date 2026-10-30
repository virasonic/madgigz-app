"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ScannerView from "@/components/scan/ScannerView";
import { createClient } from "@/lib/supabase/client";
import { fetchCurrentUser } from "@/lib/supabase/queries";
import { EventRow, mapEvent, mapTicket, TicketRow } from "@/lib/types";
import { canActAsOrganiser } from "@/lib/roles";
import { useT } from "@/lib/i18n/LocaleProvider";
import type { ScanOutcome } from "@/lib/scan-outcome";
import { countAdmissions, type AdmissionCount, type AdmissionRow } from "@/lib/scan-stats";

// The logged-in scanner: the organiser's own phone, looking tickets up through
// their own Supabase client. RLS decides which tickets they can read and check
// in (their shows; MadGigz house shows for an admin; booked shows for a pro).
// The screen itself is ScannerView, shared with the door link (#218).
export default function ScanTicketsPage() {
  const { t } = useT();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    fetchCurrentUser(supabase).then((user) => {
      // Artists scan their own gigs; admins also scan MadGigz-organised
      // (ownerless) gigs (#157), even if the admin account isn't an approved
      // artist; promoters and venues scan the shows they booked (#88). The
      // database still enforces which tickets each can actually read and check
      // in (RLS) - this only widens who reaches the scanner.
      if (!user || (!canActAsOrganiser(user) && user.role !== "admin")) {
        router.replace("/profile");
        return;
      }
      setAuthorized(true);
    });
  }, [router]);

  const lookup = useCallback(async (scanned: string): Promise<ScanOutcome> => {
    const supabase = createClient();

    // The QR carries qr_secret — the rotatable value transfers change (#145) —
    // so look tickets up by it first. Fall back to the id for older QRs and for
    // the pre-addendum_037 window where the column errors (data comes back
    // null, and we fall through).
    let ticketRow: TicketRow | null = null;
    const bySecret = await supabase.from("tickets").select("*").eq("qr_secret", scanned).maybeSingle();
    ticketRow = (bySecret.data as TicketRow | null) ?? null;
    if (!ticketRow) {
      const byId = await supabase.from("tickets").select("*").eq("id", scanned).maybeSingle();
      ticketRow = (byId.data as TicketRow | null) ?? null;
    }
    if (!ticketRow) return { status: "invalid" };
    const ticket = mapTicket(ticketRow);

    const { data: eventRow } = await supabase.from("events").select("*").eq("id", ticket.eventId).maybeSingle();
    if (!eventRow) return { status: "invalid" };
    const event = mapEvent(eventRow as EventRow);

    // The price tier this seat was bought at (#151), so the door can see at a
    // glance that e.g. a "+ beer" ticket is owed an extra. Null for a single-
    // price show, or if the tier row can't be read (degrade quietly).
    let tierName: string | null = null;
    if (ticket.tierId) {
      const { data: tierRow } = await supabase.from("event_tiers").select("name").eq("id", ticket.tierId).maybeSingle();
      tierName = (tierRow?.name as string | undefined) ?? null;
    }

    const base = {
      ticketId: ticket.id,
      eventId: ticket.eventId,
      quantity: ticket.quantity,
      tierName,
      eventTitle: event.title,
      eventVenue: event.venue,
    };
    if (ticket.refunded) return { status: "cancelled", ...base };
    if (ticket.checkedInAt) return { status: "duplicate", ...base };
    return { status: "valid", ...base };
  }, []);

  const checkIn = useCallback(async (ticketId: string): Promise<boolean> => {
    const supabase = createClient();
    // Only stamp check-in if the ticket is still un-scanned (see ScannerView).
    // Once stamped, the ticket drops out of My Tickets and shows under "Where
    // you've been" (both key off checked_in_at).
    const { data, error } = await supabase
      .from("tickets")
      .update({ checked_in_at: new Date().toISOString() })
      .eq("id", ticketId)
      .is("checked_in_at", null)
      .select("id");
    return !error && !!data && data.length > 0;
  }, []);

  // "N of M checked in" for the show of the last ticket scanned - this scanner
  // isn't tied to one show, so it can't know which until the first scan. The
  // same RLS that lets the organiser read a ticket here decides what is
  // counted; for a show they can't read it comes back 0 of 0.
  const stats = useCallback(async (eventId: string): Promise<AdmissionCount | null> => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("tickets")
      .select("quantity, checked_in_at, refunded")
      .eq("event_id", eventId);
    if (error || !data) return null;
    return countAdmissions(data as AdmissionRow[]);
  }, []);

  if (!authorized) return null;

  return (
    <ScannerView
      lookup={lookup}
      checkIn={checkIn}
      stats={stats}
      header={
        <>
          <h1 className="font-display text-2xl text-foreground">{t("scan.title")}</h1>
          <Link href="/profile" className="text-sm text-accent">
            {t("common.done")}
          </Link>
        </>
      }
    />
  );
}
