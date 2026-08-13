import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin-queries";
import { buildTicketPass } from "@/lib/apple-wallet";
import { isAppleWalletConfigured } from "@/lib/apple-wallet-config";
import { verifyWalletToken } from "@/lib/wallet-token";

// passkit-generator + node:crypto need the Node runtime, not Edge.
export const runtime = "nodejs";

// GET /api/tickets/<id>/pass?t=<token> — returns a signed Apple Wallet .pkpass for
// the caller's own ticket (#129). Authorised by EITHER a signed token (the native
// path: the pass opens in SFSafariViewController, which has no app login cookie —
// so a server action mints this token first) OR the session cookie (the web path:
// a same-origin new tab still carries it). Gated on the signing cert; 404 when
// Wallet isn't configured so its absence looks like a missing route.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticketId: string }> }
) {
  if (!isAppleWalletConfigured()) {
    return new Response("Wallet not configured", { status: 404 });
  }

  const { ticketId } = await params;
  const token = req.nextUrl.searchParams.get("t");

  let authorized = Boolean(token && verifyWalletToken(token, ticketId));

  // Session fallback: works in a same-origin web tab that still carries the cookie.
  if (!authorized) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from("tickets")
        .select("id")
        .eq("id", ticketId)
        .eq("user_id", user.id)
        .maybeSingle();
      authorized = Boolean(data);
    }
  }

  if (!authorized) return new Response("Unauthorized", { status: 401 });

  // Authorisation is established; read the ticket + event with the service role
  // (the token path has no session to scope RLS by).
  const admin = adminClient();
  const { data: ticket } = await admin
    .from("tickets")
    .select("id, quantity, refunded, events(title, venue, event_date, event_time, accent_color)")
    .eq("id", ticketId)
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
