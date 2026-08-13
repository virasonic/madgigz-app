import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildTicketPass } from "@/lib/apple-wallet";
import { isAppleWalletConfigured } from "@/lib/apple-wallet-config";

// GET /api/tickets/<id>/pass — returns a signed Apple Wallet .pkpass for the
// caller's own ticket (#129 wallet). Gated on the signing cert; 404 when Wallet
// isn't configured so the absence is indistinguishable from a missing route.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  if (!isAppleWalletConfigured()) {
    return new Response("Wallet not configured", { status: 404 });
  }

  const { ticketId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // RLS already scopes tickets to the owner; the explicit user_id match is a
  // second lock so a guessed ticket id can't mint someone else's pass.
  const { data: ticket } = await supabase
    .from("tickets")
    .select(
      "id, quantity, refunded, events(title, venue, event_date, event_time, accent_color)"
    )
    .eq("id", ticketId)
    .eq("user_id", user.id)
    .maybeSingle();

  const event = (ticket?.events ?? null) as {
    title: string;
    venue: string;
    event_date: string;
    event_time: string;
    accent_color: string | null;
  } | null;

  if (!ticket || ticket.refunded || !event) {
    return new Response("Not found", { status: 404 });
  }

  const pass = await buildTicketPass({
    ticketId: ticket.id,
    eventTitle: event.title,
    venue: event.venue,
    dateISO: event.event_date,
    time: (event.event_time ?? "").slice(0, 5),
    quantity: ticket.quantity,
    accentColor: event.accent_color,
  });
  if (!pass) return new Response("Wallet not configured", { status: 404 });

  return new Response(new Uint8Array(pass), {
    headers: {
      "Content-Type": "application/vnd.apple.pkpass",
      "Content-Disposition": 'attachment; filename="madgigz-ticket.pkpass"',
      "Cache-Control": "no-store",
    },
  });
}
