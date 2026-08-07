"use server";

import { revalidatePath } from "next/cache";
import { adminClient, requireAdmin } from "@/lib/supabase/admin-queries";
import { sendArtistStatusEmail } from "@/lib/email";
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

// No real payment processor exists yet, so "refund" here is a bookkeeping
// flag for the admin to act on manually - not a real transaction. An event
// with zero tickets sold can be hard-deleted outright (same as the artist's
// own delete path); one with tickets sold is soft-cancelled instead so the
// ticket rows survive as a record of who's owed a refund.
export async function cancelEvent(eventId: string) {
  await requireAdmin();
  const admin = adminClient();

  const { data: tickets } = await admin.from("tickets").select("id").eq("event_id", eventId);

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
  } else {
    await admin.from("tickets").update({ refunded: true }).eq("event_id", eventId);
    await admin.from("events").update({ active: false, cancelled: true }).eq("id", eventId);
  }

  revalidatePath("/admin/events");
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
