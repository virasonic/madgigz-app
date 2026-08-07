import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ContentPost,
  ContentPostRow,
  Discount,
  DiscountRow,
  EventItem,
  EventRow,
  mapContentPost,
  mapDiscount,
  mapEvent,
  mapProfile,
  mapTicket,
  AppUser,
  ProfileRow,
  Ticket,
  TicketRow,
} from "@/lib/types";

export async function fetchCurrentUser(supabase: SupabaseClient): Promise<AppUser | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select(
      "id, username, role, artist_name, instagram, tiktok, twitter, spotify, youtube, artist_status, evidence_url"
    )
    .eq("id", user.id)
    .single();

  if (!data) return null;
  return mapProfile(data as ProfileRow, user.email ?? "");
}

export async function fetchEvents(
  supabase: SupabaseClient,
  options: { activeOnly?: boolean } = {}
): Promise<EventItem[]> {
  let query = supabase.from("events").select("*").order("event_date");
  if (options.activeOnly) query = query.eq("active", true);
  const { data } = await query;
  return ((data as EventRow[]) ?? []).map(mapEvent);
}

export async function fetchContentPosts(supabase: SupabaseClient): Promise<ContentPost[]> {
  const { data } = await supabase
    .from("content_posts")
    .select("*")
    .order("created_at", { ascending: false });
  return ((data as ContentPostRow[]) ?? []).map(mapContentPost);
}

export async function fetchShowContent(
  supabase: SupabaseClient,
  eventId: string
): Promise<ContentPost[]> {
  const { data } = await supabase
    .from("content_posts")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });
  return ((data as ContentPostRow[]) ?? []).map(mapContentPost);
}

export async function fetchSavedEventIds(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data } = await supabase
    .from("saved_events")
    .select("event_id")
    .eq("user_id", userId);
  return (data ?? []).map((row) => row.event_id as string);
}

export async function toggleSavedEvent(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
  currentlySaved: boolean
) {
  if (currentlySaved) {
    await supabase
      .from("saved_events")
      .delete()
      .eq("user_id", userId)
      .eq("event_id", eventId);
  } else {
    await supabase.from("saved_events").insert({ user_id: userId, event_id: eventId });
  }
}

export async function fetchTickets(
  supabase: SupabaseClient,
  userId: string
): Promise<Ticket[]> {
  const { data } = await supabase
    .from("tickets")
    .select("*")
    .eq("user_id", userId)
    .order("purchased_at", { ascending: false });
  return ((data as TicketRow[]) ?? []).map(mapTicket);
}

export async function validateDiscountCode(
  supabase: SupabaseClient,
  code: string,
  eventId: string
): Promise<Discount | null> {
  const { data } = await supabase
    .from("discounts")
    .select("*")
    .ilike("code", code.trim())
    .eq("active", true)
    .maybeSingle();

  if (!data) return null;
  const discount = mapDiscount(data as DiscountRow);

  if (discount.eventId && discount.eventId !== eventId) return null;
  if (discount.expiresAt && new Date(discount.expiresAt).getTime() < Date.now()) return null;
  if (discount.maxUses !== null && discount.usedCount >= discount.maxUses) return null;

  return discount;
}

export async function incrementDiscountUsage(supabase: SupabaseClient, discountId: string) {
  await supabase.rpc("increment_discount_usage", { discount_id: discountId });
}

export function applyDiscount(subtotal: number, discount: Discount | null): number {
  if (!discount) return subtotal;
  const discounted =
    discount.type === "percent"
      ? subtotal * (1 - discount.value / 100)
      : subtotal - discount.value;
  return Math.max(0, Math.round(discounted * 100) / 100);
}

export async function fetchShowsByArtist(
  supabase: SupabaseClient,
  artistId: string
): Promise<EventItem[]> {
  const { data } = await supabase
    .from("events")
    .select("*")
    .eq("artist_id", artistId)
    .order("event_date");
  return ((data as EventRow[]) ?? []).map(mapEvent);
}
