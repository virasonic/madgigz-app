"use server";

// The door link's scan path (#218). No session: the token IS the credential.
// Every call re-verifies it (expiry and revocation take effect on the next
// scan, not the next page load), runs with the service-role client, and is
// scoped to the link's event - a ticket for another show is "wrong show",
// never looked at further. Returns only what the door needs (ScanOutcome), so
// an anonymous phone never sees prices or buyers.
import { createAdminClient } from "@/lib/supabase/admin";
import { touchDoorLink, verifyDoorToken } from "@/lib/door-links";
import type { ScanOutcome } from "@/lib/scan-outcome";
import { mapTicket, type TicketRow } from "@/lib/types";

export async function doorLookup(token: string, code: string): Promise<ScanOutcome> {
  const admin = createAdminClient();
  const link = await verifyDoorToken(admin, token);
  if (!link.ok) return { status: "linkExpired" };
  // Awaited: a serverless function may be frozen the moment the response is
  // sent, so a fire-and-forget write here would often never land.
  await touchDoorLink(admin, link.linkId, link.scanCount);

  // By qr_secret only. addendum_037 backfilled qr_secret = id, so a pre-037 QR
  // (which carried the id) still matches - unless the ticket was transferred
  // since and its secret rotated, in which case the old screenshot MUST fail.
  // No id fallback here, for that reason.
  const trimmed = code.trim();
  if (!/^[0-9a-f-]{36}$/i.test(trimmed)) return { status: "invalid" };
  const { data } = await admin.from("tickets").select("*").eq("qr_secret", trimmed).maybeSingle();
  if (!data) return { status: "invalid" };
  const ticket = mapTicket(data as TicketRow);
  if (ticket.eventId !== link.event.id) return { status: "wrongShow" };

  let tierName: string | null = null;
  if (ticket.tierId) {
    const { data: tier } = await admin.from("event_tiers").select("name").eq("id", ticket.tierId).maybeSingle();
    tierName = (tier?.name as string | undefined) ?? null;
  }

  const base = {
    ticketId: ticket.id,
    quantity: ticket.quantity,
    tierName,
    eventTitle: link.event.title,
    eventVenue: link.event.venue,
  };
  if (ticket.refunded) return { status: "cancelled", ...base };
  if (ticket.checkedInAt) return { status: "duplicate", ...base };
  return { status: "valid", ...base };
}

/**
 * Stamps the check-in. Atomic in the same way the logged-in scanner is: only a
 * still-unscanned ticket of THIS link's show is updated, and zero rows back
 * means someone else got there first - the caller flips to "already checked
 * in" rather than claiming a false admit.
 */
export async function doorCheckIn(token: string, ticketId: string): Promise<boolean> {
  const admin = createAdminClient();
  const link = await verifyDoorToken(admin, token);
  if (!link.ok) return false;
  const { data, error } = await admin
    .from("tickets")
    .update({ checked_in_at: new Date().toISOString() })
    .eq("id", ticketId)
    .eq("event_id", link.event.id)
    .is("checked_in_at", null)
    .select("id");
  return !error && !!data && data.length > 0;
}
