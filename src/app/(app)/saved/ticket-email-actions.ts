"use server";

import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";
import { fetchEventById } from "@/lib/supabase/queries";
import { sendTicketEmail } from "@/lib/email";
import { absoluteUrl } from "@/lib/site";
import { dateLocale } from "@/lib/dates";

// Emails the caller their own ticket (#155) — the QR shown inline and attached,
// so a fan who'd rather keep the ticket in their inbox can. Runs in the app
// WebView where the login cookie lives, re-derives the buyer from the session,
// and sends to that account's email (never an address supplied by the client).
export async function emailTicket(
  ticketId: string,
  locale: "en" | "es"
): Promise<{ ok: true; email: string } | { error: "unauthorized" | "notfound" | "unavailable" }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "unauthorized" };

  // RLS scopes tickets to their owner; the explicit user_id match is the second
  // lock. qr_secret is what the door scanner reads (#145), falling back to the
  // row id in the pre-addendum_037 window.
  const { data: ticket } = await supabase
    .from("tickets")
    .select("id, quantity, refunded, event_id, tier_id, qr_secret")
    .eq("id", ticketId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!ticket || ticket.refunded) return { error: "notfound" };

  const event = await fetchEventById(supabase, ticket.event_id as string);
  if (!event) return { error: "notfound" };

  let tierName: string | null = null;
  if (ticket.tier_id) {
    const { data: tier } = await supabase
      .from("event_tiers")
      .select("name")
      .eq("id", ticket.tier_id)
      .maybeSingle();
    tierName = (tier?.name as string | null) ?? null;
  }

  const barcodeValue = (ticket.qr_secret as string | null) ?? (ticket.id as string);
  // qrcode runs server-side too; a PNG buffer → base64 for the Resend attachment.
  const qrPngBase64 = (await QRCode.toBuffer(barcodeValue, { margin: 1, width: 320 })).toString("base64");

  const dateLabel = new Date(event.date).toLocaleDateString(dateLocale(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  const { sent } = await sendTicketEmail({
    to: user.email,
    locale,
    eventTitle: event.title,
    venue: event.venue,
    dateLabel,
    time: event.time,
    tierName,
    quantity: (ticket.quantity as number) ?? 1,
    ticketId: ticket.id as string,
    qrPngBase64,
    appUrl: absoluteUrl("/saved"),
  });

  // Resend not configured (e.g. a dev environment with no key) — tell the fan
  // rather than claim it sent.
  if (!sent) return { error: "unavailable" };
  return { ok: true, email: user.email };
}
