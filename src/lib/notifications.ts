import type { SupabaseClient } from "@supabase/supabase-js";

export type NotificationType =
  | "tagged_in_event"
  | "new_follower"
  | "followed_artist_show"
  | "event_upcoming";

export interface AppNotification {
  id: string;
  type: NotificationType;
  createdAt: string;
  readAt: string | null;
  eventId: string | null;
  eventTitle: string | null;
  eventDate: string | null;
  actorName: string | null;
}

interface NotificationRow {
  id: string;
  type: NotificationType;
  created_at: string;
  read_at: string | null;
  event_id: string | null;
  events: { title: string; event_date: string } | null;
  actor: { artist_name: string | null; username: string } | null;
}

// One query with both joins rather than a lookup per row - a busy fan's list is
// mostly "X posted a show", and resolving each name separately would be a
// request per line.
export async function fetchNotifications(
  supabase: SupabaseClient,
  userId: string,
  limit = 50
): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select(
      "id, type, created_at, read_at, event_id, events(title, event_date), actor:profiles!notifications_actor_id_fkey(artist_name, username)"
    )
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  // 42P01 = table missing, i.e. addendum_022 hasn't run. The bell shows nothing
  // rather than the page falling over.
  if (error) {
    if (error.code !== "42P01") console.error("fetchNotifications failed:", error);
    return [];
  }

  return ((data ?? []) as unknown as NotificationRow[]).map((row) => ({
    id: row.id,
    type: row.type,
    createdAt: row.created_at,
    readAt: row.read_at,
    eventId: row.event_id,
    eventTitle: row.events?.title ?? null,
    eventDate: row.events?.event_date ?? null,
    actorName: row.actor?.artist_name ?? row.actor?.username ?? null,
  }));
}

export async function fetchUnreadCount(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .is("read_at", null);

  if (error) return 0;
  return count ?? 0;
}

// The sentence a person reads. Kept out of the component so the wording for a
// type lives in one place, and so the same line can be reused if these ever
// become emails or push notifications.
export function describeNotification(n: AppNotification): { title: string; detail?: string } {
  const who = n.actorName ?? "Someone";
  const what = n.eventTitle ?? "a show";

  switch (n.type) {
    case "new_follower":
      return { title: `${who} started following you` };
    case "tagged_in_event":
      return {
        title: `You're on the bill for ${what}`,
        detail: "It's on your profile now, and you can post about it.",
      };
    case "followed_artist_show":
      return { title: `${who} announced ${what}`, detail: "Tickets are on sale." };
    case "event_upcoming":
      return { title: `${what} is tomorrow`, detail: "Your ticket is in the Tickets tab." };
  }
}
