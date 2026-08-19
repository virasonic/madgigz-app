"use server";

import { revalidatePath } from "next/cache";
import { findDeletionBlockers, purgeDueAccounts } from "@/lib/account-deletion";
import { adminClient, requireAdmin } from "@/lib/supabase/admin-queries";
import { sendArtistStatusEmail } from "@/lib/email";
import { stripe } from "@/lib/stripe";
import { removeEventMedia } from "@/lib/supabase/storage";
import { deleteStreamVideo } from "@/lib/cloudflare-stream-server";
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
  /** Tickets left alone because the holder had already been scanned in. */
  attended: number;
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
    // stripe_account_id: whether this sale was a Connect destination charge, so
    // the refund knows if there is a transfer to reverse. A house show has none.
    // checked_in_at: someone who was scanned through the door got what they
    // paid for, so cancelling the show doesn't quietly refund them too.
    .select(
      "id, quantity, price_paid, refunded, checked_in_at, stripe_payment_intent_id, stripe_account_id, tier_id"
    )
    .eq("event_id", eventId);

  if (!tickets || tickets.length === 0) {
    const { data: event } = await admin
      .from("events")
      .select("image_url")
      .eq("id", eventId)
      .single();
    const { data: posts } = await admin
      .from("content_posts")
      .select("media_url, stream_uid")
      .eq("event_id", eventId);

    // Hard-delete cascades content_posts, so clean their Cloudflare Stream videos
    // too (#139) — the soft-cancel path (further down) keeps the posts, so no
    // cleanup there.
    await Promise.all(
      (posts ?? []).map((p) => deleteStreamVideo((p as { stream_uid?: string | null }).stream_uid))
    );
    await removeEventMedia(admin, [event?.image_url, ...(posts ?? []).map((p) => p.media_url)]);
    await admin.from("events").delete().eq("id", eventId);
    revalidatePath("/admin/events");
    return { deleted: true, refunded: 0, failed: 0, attended: 0, errors: [] };
  }

  let refunded = 0;
  let failed = 0;
  let attended = 0;
  const errors: string[] = [];

  for (const ticket of tickets) {
    if (ticket.refunded) continue;

    // Scanned in means they turned up and the show happened for them. Reported
    // rather than silently skipped, so the admin can act on it deliberately if
    // the cancellation really should cover them.
    if (ticket.checked_in_at) {
      attended += 1;
      continue;
    }

    // Free tickets took no money, so there's nothing to send back.
    if (!ticket.stripe_payment_intent_id) {
      await admin.from("tickets").update({ refunded: true }).eq("id", ticket.id);
      // A tiered ticket (#151) gives its seat back to the tier (which also
      // decrements the event aggregate); a single-price ticket to the event.
      if (ticket.tier_id) {
        await admin.rpc("release_tier_capacity", {
          p_tier_id: ticket.tier_id,
          p_quantity: ticket.quantity,
        });
      } else {
        await admin.rpc("release_event_capacity", {
          p_event_id: eventId,
          p_quantity: ticket.quantity,
        });
      }
      refunded += 1;
      continue;
    }

    try {
      await stripe.refunds.create(
        {
          // Refund only this seat's share (per-ticket rows, addendum 036). A
          // pre-migration single row's price_paid is the whole order, so this is
          // a full refund exactly as before. reverse_transfer / refund_
          // application_fee reverse the transfer + fee proportionally to amount.
          amount: Math.round(Number(ticket.price_paid) * 100),
          payment_intent: ticket.stripe_payment_intent_id,
          // Destination charges put the money in the artist's balance. Without
          // reverse_transfer the fan gets refunded out of MadGigz's balance
          // while the artist keeps the payment.
          //
          // A house show never transferred anything and was charged no fee, so
          // both flags are omitted - Stripe errors on a reversal with nothing
          // to reverse. The ticket's own snapshot decides, not the event's
          // current flag, since the event may have been edited since the sale.
          ...(ticket.stripe_account_id
            ? { reverse_transfer: true, refund_application_fee: true }
            : {}),
        },
        { idempotencyKey: `refund_${ticket.id}` }
      );

      await admin.from("tickets").update({ refunded: true }).eq("id", ticket.id);
      // A tiered ticket (#151) gives its seat back to the tier (which also
      // decrements the event aggregate); a single-price ticket to the event.
      if (ticket.tier_id) {
        await admin.rpc("release_tier_capacity", {
          p_tier_id: ticket.tier_id,
          p_quantity: ticket.quantity,
        });
      } else {
        await admin.rpc("release_event_capacity", {
          p_event_id: eventId,
          p_quantity: ticket.quantity,
        });
      }
      refunded += 1;
    } catch (error) {
      failed += 1;
      errors.push(error instanceof Error ? error.message : "Unknown refund error");
    }
  }

  await admin.from("events").update({ active: false, cancelled: true }).eq("id", eventId);

  revalidatePath("/admin/events");
  return { deleted: false, refunded, failed, attended, errors };
}

// Refunds one ticket without touching the rest of the event - for special
// circumstances (a fan who can't make it, a duplicate order), not routine use.
// Shares the cancelEvent idempotency key (refund_{ticketId}), so the two paths
// can never double-refund the same ticket: whichever runs second gets Stripe's
// cached response for the first.
export async function refundTicket(
  ticketId: string,
  // Refunds a ticket that was scanned in at the door. Off by default and
  // never set by the first click: the UI blocks, explains, and only then
  // offers this. Goodwill, a door dispute or a mis-scan are all real, but
  // none of them should be one accidental tap away.
  force = false
): Promise<{ error: string | null; blockedByCheckIn?: boolean }> {
  await requireAdmin();
  const admin = adminClient();

  const { data: ticket } = await admin
    .from("tickets")
    .select(
      "id, event_id, quantity, price_paid, refunded, checked_in_at, stripe_payment_intent_id, stripe_account_id, tier_id"
    )
    .eq("id", ticketId)
    .single();

  if (!ticket) return { error: "Ticket not found" };
  if (ticket.refunded) return { error: "Already refunded" };
  // They were scanned through the door: the gig happened for them. Refunding a
  // used ticket is giving the money back for something delivered - possible,
  // but it should be a decision rather than a slip.
  if (ticket.checked_in_at && !force) {
    return {
      error: "That ticket was scanned in at the door.",
      blockedByCheckIn: true,
    };
  }

  if (ticket.checked_in_at) {
    console.warn(`Refunding ticket ${ticket.id}, which was checked in at ${ticket.checked_in_at}`);
  }

  // Free tickets took no money; there's nothing to send back, but the ticket
  // still gets invalidated and its seats released.
  if (ticket.stripe_payment_intent_id) {
    try {
      await stripe.refunds.create(
        {
          // Per-seat rows (addendum 036): refund just this ticket's price_paid.
          // A pre-migration single row holds the whole order, so this stays a
          // full refund. reverse_transfer / refund_application_fee act
          // proportionally to amount.
          amount: Math.round(Number(ticket.price_paid) * 100),
          payment_intent: ticket.stripe_payment_intent_id,
          // Funds sit in the artist's balance under destination charges -
          // without reverse_transfer the fan would be repaid out of MadGigz's
          // pocket while the artist keeps the money. A house show transferred
          // nothing, so there is nothing to reverse and Stripe would error.
          ...(ticket.stripe_account_id
            ? { reverse_transfer: true, refund_application_fee: true }
            : {}),
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

  // Capacity only goes back if the seat was never used. Releasing it for
  // someone who walked in would put a seat that was physically occupied back
  // on sale.
  if (!ticket.checked_in_at) {
    if (ticket.tier_id) {
      await admin.rpc("release_tier_capacity", {
        p_tier_id: ticket.tier_id,
        p_quantity: ticket.quantity,
      });
    } else {
      await admin.rpc("release_event_capacity", {
        p_event_id: ticket.event_id,
        p_quantity: ticket.quantity,
      });
    }
  }

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
  // Read `count`, not `data`: a head:true request returns no rows at all, so
  // the old `data.length` test was always false and this guard never fired.
  const { count: liveTickets } = await admin
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("stripe_account_id", profile.stripe_account_id)
    .eq("refunded", false);

  if (liveTickets && liveTickets > 0) {
    return { error: "Cannot reset: artist has live tickets. Contact Stripe support." };
  }

  // Delete the connected account - Stripe will reject if there's pending
  // balance, but that's a rare edge case and the admin can always retry
  // after those funds are paid out.
  //
  // `resource_missing` is the exception: the account doesn't exist under the
  // key we're holding. That's the test->live swap case - every stored acct_ id
  // was minted in test mode and is invisible to the live key - and it's exactly
  // the row that most needs clearing, since startPayoutOnboarding only mints a
  // fresh account when the column is null. Treat "not there" as already-deleted
  // and fall through to the clear, rather than returning an error that would
  // strand the artist with an unusable account they can never replace.
  try {
    await stripe.accounts.del(profile.stripe_account_id);
  } catch (error) {
    if ((error as { code?: string })?.code !== "resource_missing") {
      console.error(`Failed to delete Stripe account ${profile.stripe_account_id}:`, error);
      return {
        error:
          error instanceof Error && error.message.includes("pending")
            ? "Artist has pending balance - wait for payout to complete, then retry"
            : "Stripe deletion failed - check the logs and retry",
      };
    }
    console.warn(
      `Stripe account ${profile.stripe_account_id} not found under the current key - clearing the stale reference.`
    );
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
