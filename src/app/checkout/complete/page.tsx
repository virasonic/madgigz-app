import Link from "next/link";
import { redirect } from "next/navigation";
import { stripe } from "@/lib/stripe";
import { fulfilCheckoutSession } from "@/lib/fulfilment";
import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import TicketEmailPrompt from "@/components/feed/TicketEmailPrompt";

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
  if (!user) redirect("/signin");

  const { t } = await getServerT();

  let ok = false;
  let message = t("checkout.errorBody");

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Don't let one fan's session id reveal or fulfil another's purchase.
    if (session.metadata?.user_id !== user.id) {
      redirect("/feed");
    }

    if (session.payment_status === "paid") {
      await fulfilCheckoutSession(session);
      ok = true;
    } else {
      message = t("checkout.pendingBody");
    }
  } catch {
    // Fall through to the failure message - the webhook remains the backstop.
  }

  // Resolve the just-bought ticket so the buyer can email it (#155), matching
  // the free-ticket success screen. Keyed by session id, so it works whichever
  // path fulfilled the ticket (this page or the webhook).
  let ticketId: string | null = null;
  if (ok) {
    const { data } = await supabase
      .from("tickets")
      .select("id")
      .eq("stripe_session_id", sessionId)
      .eq("user_id", user.id)
      .maybeSingle();
    ticketId = (data?.id as string | null) ?? null;
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
        <TicketEmailPrompt ticketId={ticketId} />
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
