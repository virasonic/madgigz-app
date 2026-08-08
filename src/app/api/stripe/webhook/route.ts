import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { payoutsReady, stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { fulfilCheckoutSession } from "@/lib/fulfilment";

// Signature verification needs the raw body, so this must never be statically
// optimised or run on the edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function releaseCapacity(session: Stripe.Checkout.Session) {
  const eventId = session.metadata?.event_id;
  const quantity = Number(session.metadata?.quantity ?? 0);
  if (!eventId || !quantity) return;

  const admin = createAdminClient();
  await admin.rpc("release_event_capacity", { p_event_id: eventId, p_quantity: quantity });
}

// Stripe delivers platform events (checkout.session.*) and connected-account
// events (account.updated on v1 accounts) to *separate* destinations, each with
// its own signing secret. Both point at this route, so a delivery is genuine if
// it verifies against any configured secret.
function webhookSecrets(): string[] {
  return [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_WEBHOOK_SECRET_CONNECT].filter(
    (s): s is string => Boolean(s)
  );
}

export async function POST(request: NextRequest) {
  const secrets = webhookSecrets();
  if (secrets.length === 0) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const body = await request.text();
  let event: Stripe.Event | null = null;
  let lastError: unknown = null;

  for (const secret of secrets) {
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, secret);
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!event) {
    // Verified against none of them - never process it, and don't ask Stripe to
    // retry, since a bad signature won't fix itself.
    console.error("Stripe webhook signature verification failed:", lastError);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        // Async methods (Bizum, SEPA) fire this before the money settles -
        // issuing a ticket here would hand out unpaid entry.
        if (session.payment_status === "paid") {
          await fulfilCheckoutSession(session);
        }
        break;
      }

      case "checkout.session.async_payment_succeeded": {
        await fulfilCheckoutSession(event.data.object);
        break;
      }

      // Nobody paid, so give the held seats back.
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        await releaseCapacity(event.data.object);
        break;
      }

      // Keeps the "can this artist sell?" flag in step with Stripe's own view,
      // including when a previously-ready account loses the capability.
      case "account.updated": {
        const account = event.data.object;
        const admin = createAdminClient();
        await admin
          .from("profiles")
          .update({ stripe_payouts_ready: payoutsReady(account) })
          .eq("stripe_account_id", account.id);
        break;
      }
    }
  } catch (error) {
    // A 500 tells Stripe to retry, which is what we want for transient
    // failures - fulfilment is idempotent, so a retry is safe.
    console.error(`Stripe webhook handler failed for ${event.type}:`, error);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
