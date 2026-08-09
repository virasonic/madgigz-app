"use server";

import { revalidatePath } from "next/cache";
import { findDeletionBlockers, purgeDueAccounts } from "@/lib/account-deletion";
import { adminClient, requireAdmin } from "@/lib/supabase/admin-queries";
import { sendArtistStatusEmail } from "@/lib/email";
import { stripe } from "@/lib/stripe";
import { removeEventMedia } from "@/lib/supabase/storage";
import { ArtistStatus } from "@/lib/types";

export async function setArtistStatus(profileId: string, email: string, status: ArtistStatus) {
  await requireAdmin();
  const admin = adminClient();
  await admin.from("profiles").update({ artist_status: status }).eq("id", profileId);
  revalidatePath("/admin/artists");

  if (status === "approved" || status === "rejected") {
    await sendArtistStatusEmail(email, status);
  }
}

export interface CancelEventResult {
  deleted: boolean;
  refunded: number;
  failed: number;
  errors: string[];
}

// An event with no tickets is hard-deleted outright. One with tickets is
// soft-cancelled and every ticket refunded for real through Stripe.
//
// Refunds are done per ticket and are partial-failure tolerant: `refunded` is
// set only after Stripe confirms that specific refund, so a failure leaves an
// accurate record to retry rather than a row claiming money went back when it
// didn't. Re-running the action retries only what's still outstanding.
export async function cancelEvent(eventId: string): Promise<CancelEventResult> {
  await requireAdmin();
  const admin = adminClient();

  const { data: tickets } = await admin
    .from("tickets")
    .select("id, quantity, price_paid, refunded, stripe_payment_intent_id")
    .eq("event_id", eventId);

  if (!tickets || tickets.length === 0) {
    const { data: event } = await admin
      .from("events")
      .select("image_url")
      .eq("id", eventId)
      .single();
    const { data: posts } = await admin
      .from("content_posts")
      .select("media_url")
      .eq("event_id", eventId);

    await removeEventMedia(admin, [event?.image_url, ...(posts ?? []).map((p) => p.media_url)]);
    await admin.from("events").delete().eq("id", eventId);
    revalidatePath("/admin/events");
    return { deleted: true, refunded: 0, failed: 0, errors: [] };
  }

  let refunded = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const ticket of tickets) {
    if (ticket.refunded) continue;

    // Free tickets took no money, so there's nothing to send back.
    if (!ticket.stripe_payment_intent_id) {
      await admin.from("tickets").update({ refunded: true }).eq("id", ticket.id);
      await admin.rpc("release_event_capacity", {
        p_event_id: eventId,
        p_quantity: ticket.quantity,
      });
      refunded += 1;
      continue;
    }

    try {
      await stripe.refunds.create(
        {
          payment_intent: ticket.stripe_payment_intent_id,
          // Destination charges put the money in the artist's balance. Without
          // reverse_transfer the fan gets refunded out of MadGigz's balance
          // while the artist keeps the payment.
          reverse_transfer: true,
          refund_application_fee: true,
        },
        { idempotencyKey: `refund_${ticket.id}` }
      );

      await admin.from("tickets").update({ refunded: true }).eq("id", ticket.id);
      await admin.rpc("release_event_capacity", {
        p_event_id: eventId,
        p_quantity: ticket.quantity,
      });
      refunded += 1;
    } catch (error) {
      failed += 1;
      errors.push(error instanceof Error ? error.message : "Unknown refund error");
    }
  }

  await admin.from("events").update({ active: false, cancelled: true }).eq("id", eventId);

  revalidatePath("/admin/events");
  return { deleted: false, refunded, failed, errors };
}

// Refunds one ticket without touching the rest of the event - for special
// circumstances (a fan who can't make it, a duplicate order), not routine use.
// Shares the cancelEvent idempotency key (refund_{ticketId}), so the two paths
// can never double-refund the same ticket: whichever runs second gets Stripe's
// cached response for the first.
export async function refundTicket(ticketId: string): Promise<{ error: string | null }> {
  await requireAdmin();
  const admin = adminClient();

  const { data: ticket } = await admin
    .from("tickets")
    .select("id, event_id, quantity, refunded, stripe_payment_intent_id")
    .eq("id", ticketId)
    .single();

  if (!ticket) return { error: "Ticket not found" };
  if (ticket.refunded) return { error: "Already refunded" };

  // Free tickets took no money; there's nothing to send back, but the ticket
  // still gets invalidated and its seats released.
  if (ticket.stripe_payment_intent_id) {
    try {
      await stripe.refunds.create(
        {
          payment_intent: ticket.stripe_payment_intent_id,
          // Funds sit in the artist's balance under destination charges -
          // without reverse_transfer the fan would be repaid out of MadGigz's
          // pocket while the artist keeps the money.
          reverse_transfer: true,
          refund_application_fee: true,
        },
        { idempotencyKey: `refund_${ticket.id}` }
      );
    } catch (error) {
      // Logged in full server-side; the admin gets a plain message rather than
      // a raw Stripe error.
      console.error(`Refund failed for ticket ${ticket.id}:`, error);
      return { error: "Stripe refund failed - nothing was changed. Check the logs and retry." };
    }
  }

  await admin.from("tickets").update({ refunded: true }).eq("id", ticket.id);
  await admin.rpc("release_event_capacity", {
    p_event_id: ticket.event_id,
    p_quantity: ticket.quantity,
  });

  revalidatePath("/admin/billing");
  return { error: null };
}

// Pays out an artist's held Stripe balance to their bank. Artist accounts run
// on a manual payout schedule, so this is the only way money leaves Stripe -
// meant to be pressed once their event has happened.
export async function releaseArtistPayout(
  profileId: string
): Promise<{ paidCents: number; error: string | null }> {
  await requireAdmin();
  const admin = adminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_account_id")
    .eq("id", profileId)
    .single();
  if (!profile?.stripe_account_id) return { paidCents: 0, error: "No payout account connected" };

  try {
    const balance = await stripe.balance.retrieve({}, { stripeAccount: profile.stripe_account_id });
    const available = balance.available.find((b) => b.currency === "eur")?.amount ?? 0;
    if (available <= 0) {
      // Card funds spend a few days as "pending" before Stripe lets them be
      // paid out - not an error, just not releasable yet.
      return { paidCents: 0, error: "Nothing available to pay out yet" };
    }

    await stripe.payouts.create(
      { amount: available, currency: "eur" },
      {
        stripeAccount: profile.stripe_account_id,
        // Same account + same amount + same day = one payout, so an accidental
        // double-click can't pay twice.
        idempotencyKey: `payout_${profile.stripe_account_id}_${available}_${new Date().toISOString().slice(0, 10)}`,
      }
    );

    revalidatePath("/admin/payouts");
    return { paidCents: available, error: null };
  } catch (error) {
    console.error(`Payout failed for profile ${profileId}:`, error);
    return { paidCents: 0, error: "Payout failed - nothing was sent. Check the logs and retry." };
  }
}

export async function promoteToAdmin(userId: string) {
  await requireAdmin();
  const admin = adminClient();
  await admin.from("profiles").update({ role: "admin" }).eq("id", userId);
  revalidatePath("/admin/users");
}

export async function toggleEventActive(eventId: string, active: boolean) {
  await requireAdmin();
  const admin = adminClient();
  await admin.from("events").update({ active }).eq("id", eventId);
  revalidatePath("/admin/events");
}

export async function createDiscount(data: {
  code: string;
  type: "percent" | "fixed";
  value: number;
  eventId: string | null;
  maxUses: number | null;
  expiresAt: string | null;
}) {
  await requireAdmin();
  const admin = adminClient();
  const { error } = await admin.from("discounts").insert({
    code: data.code.trim().toUpperCase(),
    type: data.type,
    value: data.value,
    event_id: data.eventId,
    max_uses: data.maxUses,
    expires_at: data.expiresAt,
  });
  revalidatePath("/admin/discounts");
  return { error: error?.message ?? null };
}

export async function resetArtistPayoutAccount(
  profileId: string
): Promise<{ error: string | null }> {
  await requireAdmin();
  const admin = adminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_account_id, stripe_payouts_ready")
    .eq("id", profileId)
    .single();

  if (!profile?.stripe_account_id) {
    return { error: "No payout account connected" };
  }

  // Check if they have any live (non-refunded) tickets sold - those are
  // backed by a live balance in Stripe that deleting the account would orphan.
  const { data: liveTickets } = await admin
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("stripe_account_id", profile.stripe_account_id)
    .eq("refunded", false);

  if ((liveTickets && liveTickets.length > 0) || (!liveTickets && false)) {
    return { error: "Cannot reset: artist has live tickets. Contact Stripe support." };
  }

  // Delete the connected account - Stripe will reject if there's pending
  // balance, but that's a rare edge case and the admin can always retry
  // after those funds are paid out.
  try {
    await stripe.accounts.del(profile.stripe_account_id);
  } catch (error) {
    console.error(`Failed to delete Stripe account ${profile.stripe_account_id}:`, error);
    return {
      error:
        error instanceof Error && error.message.includes("pending")
          ? "Artist has pending balance - wait for payout to complete, then retry"
          : "Stripe deletion failed - check the logs and retry",
    };
  }

  // Clear the references so they can start fresh onboarding
  await admin
    .from("profiles")
    .update({ stripe_account_id: null, stripe_payouts_ready: false })
    .eq("id", profileId);

  revalidatePath("/admin/artists");
  return { error: null };
}

export async function toggleDiscountActive(discountId: string, active: boolean) {
  await requireAdmin();
  const admin = adminClient();
  await admin.from("discounts").update({ active }).eq("id", discountId);
  revalidatePath("/admin/discounts");
}

// Admin-initiated deletion. Deliberately the same request-and-wait path a
// person gets rather than an instant wipe: the blockers protect ticket holders,
// not the account holder, so an admin overriding them would strand exactly the
// people the rule exists for. The grace period also means a mistaken click here
// is recoverable.
export async function requestUserDeletion(profileId: string) {
  await requireAdmin();
  const admin = adminClient();

  const blockers = await findDeletionBlockers(admin, profileId);
  if (blockers.length > 0) {
    return { error: blockers.map((b) => b.reason).join("; ") };
  }

  const { error } = await admin
    .from("profiles")
    .update({ deletion_requested_at: new Date().toISOString() })
    .eq("id", profileId)
    .is("deleted_at", null);

  if (error) return { error: error.message };
  revalidatePath("/admin/users");
  return { error: null };
}

export async function cancelUserDeletion(profileId: string) {
  await requireAdmin();
  const admin = adminClient();
  await admin
    .from("profiles")
    .update({ deletion_requested_at: null })
    .eq("id", profileId)
    .is("deleted_at", null);
  revalidatePath("/admin/users");
  return { error: null };
}

// The same job the nightly cron runs, on a button. Worth having: it makes the
// purge testable without waiting 30 days, and it means deletions still complete
// if the cron is ever misconfigured.
export async function runAccountPurge() {
  await requireAdmin();
  const results = await purgeDueAccounts(adminClient());
  revalidatePath("/admin/users");
  return results;
}
