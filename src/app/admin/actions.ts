"use server";

import { revalidatePath } from "next/cache";
import { adminClient, requireAdmin } from "@/lib/supabase/admin-queries";

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
