"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FanPhotoStatus } from "@/lib/fan-photos";

// #195: fan photos are written with the caller's OWN client. The RLS policies
// (attendee inserts pending on a past show they attended; organiser flips the
// status; owner deletes) and the guard trigger (3 per fan per show, review
// touches status only) are the enforcement.

type Result = { ok: boolean; error?: "not_signed_in" | "limit" | "not_attended" | "failed" };

function refresh(eventId: string) {
  revalidatePath(`/e/${eventId}`);
  revalidatePath(`/profile/fan-photos/${eventId}`);
  revalidatePath("/profile/[artistId]", "page");
  revalidatePath("/notifications");
}

export async function addFanPhoto(eventId: string, mediaUrl: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { error } = await supabase
    .from("fan_photos")
    .insert({ event_id: eventId, user_id: user.id, media_url: mediaUrl, status: "pending" });
  if (error) {
    // The guard trigger raises check_violation (23514) with the limit message;
    // a policy refusal is 42501 and means "you didn't attend this".
    if (error.message?.includes("fan_photos_limit")) return { ok: false, error: "limit" };
    if (error.code === "42501") return { ok: false, error: "not_attended" };
    console.error("addFanPhoto failed:", error);
    return { ok: false, error: "failed" };
  }
  refresh(eventId);
  return { ok: true };
}

export async function deleteFanPhoto(photoId: string, eventId: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { data, error } = await supabase
    .from("fan_photos")
    .delete()
    .eq("id", photoId)
    .eq("user_id", user.id)
    .select("id");
  if (error || (data?.length ?? 0) === 0) return { ok: false, error: "failed" };
  refresh(eventId);
  return { ok: true };
}

/** Organiser review: approve or hide. The read-back confirms the row moved. */
export async function reviewFanPhoto(
  photoId: string,
  eventId: string,
  status: Exclude<FanPhotoStatus, "pending">
): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { data, error } = await supabase
    .from("fan_photos")
    .update({ status })
    .eq("id", photoId)
    .select("status");
  if (error || (data?.length ?? 0) === 0 || data![0].status !== status) {
    if (error) console.error("reviewFanPhoto failed:", error);
    return { ok: false, error: "failed" };
  }
  refresh(eventId);
  return { ok: true };
}

export async function reviewAllPending(
  eventId: string,
  status: Exclude<FanPhotoStatus, "pending">
): Promise<Result & { count: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in", count: 0 };

  const { data, error } = await supabase
    .from("fan_photos")
    .update({ status })
    .eq("event_id", eventId)
    .eq("status", "pending")
    .select("id");
  if (error) {
    console.error("reviewAllPending failed:", error);
    return { ok: false, error: "failed", count: 0 };
  }
  refresh(eventId);
  return { ok: true, count: data?.length ?? 0 };
}
