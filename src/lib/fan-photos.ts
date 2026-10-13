import type { SupabaseClient } from "@supabase/supabase-js";
import type { FanCard } from "@/lib/friends";

// #195 / #149 Phase C: fan photos on a show. Read side. Every reader degrades
// to [] on a database where addendum_060 hasn't run (table missing).

export type FanPhotoStatus = "pending" | "approved" | "hidden";

export interface FanPhoto {
  id: string;
  eventId: string;
  userId: string;
  mediaUrl: string;
  status: FanPhotoStatus;
  createdAt: string;
  /** The poster's public card; present when the query embedded it. */
  user: FanCard | null;
  /** Show title, when embedded (the artist strip and a friend's profile). */
  eventTitle: string | null;
}

interface FanPhotoRow {
  id: string;
  event_id: string;
  user_id: string;
  media_url: string;
  status: FanPhotoStatus;
  created_at: string;
  profiles?: { id: string; username: string; artist_photo_url: string | null } | null;
  events?: { title: string } | null;
}

/** How many photos one fan may add to one show. Mirrors the DB trigger. */
export const FAN_PHOTO_LIMIT = 3;

const MISSING = new Set(["42P01", "PGRST205"]);

function map(row: FanPhotoRow): FanPhoto {
  return {
    id: row.id,
    eventId: row.event_id,
    userId: row.user_id,
    mediaUrl: row.media_url,
    status: row.status,
    createdAt: row.created_at,
    user: row.profiles
      ? { id: row.profiles.id, username: row.profiles.username, photoUrl: row.profiles.artist_photo_url }
      : null,
    eventTitle: row.events?.title ?? null,
  };
}

const WITH_USER = "id, event_id, user_id, media_url, status, created_at, profiles!fan_photos_user_id_fkey(id, username, artist_photo_url)";

/**
 * Every photo on a show the caller is allowed to see: approved ones for
 * everyone, plus their own in any state, plus all of them for the organiser.
 * RLS does the filtering; this just asks.
 */
export async function fetchFanPhotosForEvent(
  supabase: SupabaseClient,
  eventId: string
): Promise<FanPhoto[]> {
  const { data, error } = await supabase
    .from("fan_photos")
    .select(WITH_USER)
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  if (error) {
    if (!MISSING.has(error.code)) console.error("fetchFanPhotosForEvent failed:", error);
    return [];
  }
  return ((data ?? []) as unknown as FanPhotoRow[]).map(map);
}

/** Approved photos across an organiser's shows, newest first. */
export async function fetchApprovedPhotosForOrganiser(
  supabase: SupabaseClient,
  organiserId: string,
  limit = 6
): Promise<FanPhoto[]> {
  const { data, error } = await supabase
    .from("fan_photos")
    .select(`${WITH_USER}, events!inner(title, artist_id, pro_account_id)`)
    .eq("status", "approved")
    .or(`artist_id.eq.${organiserId},pro_account_id.eq.${organiserId}`, { referencedTable: "events" })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (!MISSING.has(error.code)) console.error("fetchApprovedPhotosForOrganiser failed:", error);
    return [];
  }
  return ((data ?? []) as unknown as FanPhotoRow[]).map(map);
}

/** A fan's approved photos, newest first (a friend's profile strip). */
export async function fetchApprovedPhotosForFan(
  supabase: SupabaseClient,
  userId: string,
  limit = 12
): Promise<FanPhoto[]> {
  const { data, error } = await supabase
    .from("fan_photos")
    .select("id, event_id, user_id, media_url, status, created_at, events(title)")
    .eq("user_id", userId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (!MISSING.has(error.code)) console.error("fetchApprovedPhotosForFan failed:", error);
    return [];
  }
  return ((data ?? []) as unknown as FanPhotoRow[]).map(map);
}

/** Photos waiting for review on one show, for the manage-show badge. */
export async function fetchPendingPhotoCount(
  supabase: SupabaseClient,
  eventId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("fan_photos")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "pending");
  if (error) return 0;
  return count ?? 0;
}
