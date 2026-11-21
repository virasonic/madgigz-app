import Link from "next/link";
import { redirect } from "next/navigation";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { fulfilCheckoutSession } from "@/lib/fulfilment";
import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import TicketEmailPrompt from "@/components/feed/TicketEmailPrompt";
import PurchaseFollowUp from "./PurchaseFollowUp";

// Stripe redirects the fan here after payment. The webhook is the authoritative
// fulfilment path, but it frequently lands *after* the browser does - so this
// page runs the same idempotent fulfilment itself rather than showing the fan a
// "where's my ticket?" gap. Whichever gets there first wins; the other no-ops.
export default async function CheckoutCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;
  if (!sessionId) redirect("/feed");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { t } = await getServerT();

  let session: Stripe.Checkout.Session | null = null;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    session = null;
  }

  // A guest order (#234) has no session to land in: the ticket went to the
  // email (sent by fulfilment, by whichever of this page and the webhook got
  // there first), so this page says where it went and points at more shows.
  // The address is masked - the session id is in the URL bar of whoever paid,
  // and that is all this page should give away about them.
  if (session?.metadata?.guest === "1") {
    let paid = false;
    if (session.payment_status === "paid") {
      try {
        await fulfilCheckoutSession(session);
        paid = true;
      } catch {
        // The webhook remains the backstop; the copy below stays honest.
      }
    }
    const email = maskEmail(session.metadata.guest_email ?? "");
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl ${
            paid ? "bg-primary text-foreground" : "bg-surface text-muted"
          }`}
        >
          {paid ? "✓" : "…"}
        </div>
        <h1 className="font-display text-2xl text-foreground">
          {paid ? t("checkout.guestTitle") : t("checkout.pendingTitle")}
        </h1>
        <p className="max-w-xs text-sm text-muted">
          {paid
            ? t("checkout.guestBody", { email })
            : t("checkout.guestPending", { email })}
        </p>
        <Link
          href="/feed"
          className="mt-4 rounded-full bg-primary px-6 py-3 font-heading text-sm text-foreground"
        >
          {t("checkout.guestBrowse")}
        </Link>
      </div>
    );
  }

  if (!user) redirect("/signin");

  let ok = false;
  let message = t("checkout.errorBody");

  if (session) {
    // Don't let one fan's session id reveal or fulfil another's purchase.
    if (session.metadata?.user_id !== user.id) {
      redirect("/feed");
    }
    try {
      if (session.payment_status === "paid") {
        await fulfilCheckoutSession(session);
        ok = true;
      } else {
        message = t("checkout.pendingBody");
      }
    } catch {
      // Fall through to the failure message - the webhook remains the backstop.
    }
  }

  // Resolve the just-bought ticket so the buyer can email it (#155), matching
  // the free-ticket success screen. Keyed by session id, so it works whichever
  // path fulfilled the ticket (this page or the webhook).
  let ticketId: string | null = null;
  let eventId: string | null = null;
  let quantity = 1;
  if (ok) {
    // One row per seat (#036), so the list length is the quantity bought.
    const { data } = await supabase
      .from("tickets")
      .select("id, event_id")
      .eq("stripe_session_id", sessionId)
      .eq("user_id", user.id);
    const rows = (data ?? []) as { id: string; event_id: string }[];
    ticketId = rows[0]?.id ?? null;
    eventId = rows[0]?.event_id ?? null;
    quantity = Math.max(1, rows.length);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <div
        className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl ${
          ok ? "bg-primary text-foreground" : "bg-surface text-muted"
        }`}
      >
        {ok ? "✓" : "…"}
      </div>
      <h1 className="font-display text-2xl text-foreground">
        {ok ? t("ticket.goingTitle") : t("checkout.pendingTitle")}
      </h1>

      {ok ? (
        // The "saved in the app" note + "email me this ticket" option, identical
        // to the free-ticket success screen inside TicketModal.
        <>
          <TicketEmailPrompt ticketId={ticketId} />
          <PurchaseFollowUp eventId={eventId} quantity={quantity} />
        </>
      ) : (
        <p className="max-w-xs text-sm text-muted">{message}</p>
      )}

      <Link
        href="/saved"
        className="mt-4 rounded-full bg-primary px-6 py-3 font-heading text-sm text-foreground"
      >
        {t("checkout.viewTickets")}
      </Link>
    </div>
  );
}

// "v•••@example.com": enough for the buyer to recognise, nothing for anyone
// else holding the URL.
function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 1) return email;
  return `${email[0]}•••${email.slice(at)}`;
}
