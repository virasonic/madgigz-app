"use server";

import { revalidatePath } from "next/cache";
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

export async function toggleDiscountActive(discountId: string, active: boolean) {
  await requireAdmin();
  const admin = adminClient();
  await admin.from("discounts").update({ active }).eq("id", discountId);
  revalidatePath("/admin/discounts");
}
