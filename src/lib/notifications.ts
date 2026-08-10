import type { SupabaseClient } from "@supabase/supabase-js";

export type NotificationType =
  | "tagged_in_event"
  | "new_follower"
  | "followed_artist_show"
  | "event_upcoming"
  | "ticket_sold";

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
// A translator, shaped like useT()'s `t`. Passed in rather than imported so
// this file stays free of React and can run on the server too; the notification
// content still follows the reader's language because the caller hands over the
// catalog it already has.
export type Translate = (key: string, vars?: Record<string, string | number>) => string;

export function describeNotification(
  n: AppNotification,
  t: Translate
): { title: string; detail?: string } {
  const who = n.actorName ?? t("notifications.someone");
  const what = n.eventTitle ?? t("notifications.aShow");

  switch (n.type) {
    case "new_follower":
      return { title: t("notifications.newFollower", { who }) };
    case "tagged_in_event":
      return {
        title: t("notifications.taggedTitle", { what }),
        detail: t("notifications.taggedDetail"),
      };
    case "followed_artist_show":
      return {
        title: t("notifications.announcedTitle", { who, what }),
        detail: t("notifications.announcedDetail"),
      };
    case "event_upcoming":
      // Deliberately about the show rather than "your gig" - the recipient is
      // whoever holds a ticket, which is the audience, not the performer.
      return {
        title: t("notifications.upcomingTitle", { what }),
        detail: t("notifications.upcomingDetail"),
      };
    case "ticket_sold":
      return { title: t("notifications.ticketSoldTitle", { who, what }) };
  }
}


// ---- Grouping ----

export interface NotificationGroup {
  key: string;
  type: NotificationType;
  /** How many notifications this line stands for. 1 means it wasn't grouped. */
  count: number;
  /** Newest of the group - what the timestamp and ordering use. */
  latest: AppNotification;
  /** Distinct actor names, newest first, for "Ana, Beto and 8 others". */
  actorNames: string[];
  unread: boolean;
}

// Below this, a list reads better than a tally: "Ana followed you" tells an
// artist something "3 people followed you" doesn't.
const GROUP_THRESHOLD = 3;

// Grouped by type and by show, so "12 new ticket sales for Neon Sundays" never
// merges with sales for a different night. new_follower has no event, so all of
// those collapse together - which is what you want, since a follow isn't
// attached to anything.
export function groupNotifications(list: AppNotification[]): NotificationGroup[] {
  const buckets = new Map<string, AppNotification[]>();

  for (const n of list) {
    const key = `${n.type}:${n.eventId ?? "-"}`;
    buckets.set(key, [...(buckets.get(key) ?? []), n]);
  }

  const groups: NotificationGroup[] = [];

  for (const [key, items] of buckets) {
    // Already newest-first out of the query, but don't rely on that holding.
    const sorted = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (sorted.length < GROUP_THRESHOLD) {
      sorted.forEach((n) =>
        groups.push({
          key: n.id,
          type: n.type,
          count: 1,
          latest: n,
          actorNames: n.actorName ? [n.actorName] : [],
          unread: !n.readAt,
        })
      );
      continue;
    }

    groups.push({
      key,
      type: sorted[0].type,
      count: sorted.length,
      latest: sorted[0],
      actorNames: [...new Set(sorted.map((n) => n.actorName).filter(Boolean) as string[])],
      // One unread in the group is enough to mark the line unread - otherwise a
      // new sale would hide inside a group already read.
      unread: sorted.some((n) => !n.readAt),
    });
  }

  return groups.sort((a, b) => b.latest.createdAt.localeCompare(a.latest.createdAt));
}

function nameList(names: string[], count: number, t: Translate): string {
  if (names.length === 0) return t("notifications.peopleCount", { count });
  if (names.length === 1)
    return t("notifications.nameAndOthers", { name: names[0], count: count - 1 });
  const others = count - 2;
  if (others <= 0) return t("notifications.twoNames", { name1: names[0], name2: names[1] });
  return t("notifications.namesAndOthers", {
    name1: names[0],
    name2: names[1],
    others,
    othersWord: others === 1 ? t("notifications.other") : t("notifications.others"),
  });
}

export function describeGroup(
  g: NotificationGroup,
  t: Translate
): { title: string; detail?: string } {
  if (g.count === 1) return describeNotification(g.latest, t);

  const what = g.latest.eventTitle ?? t("notifications.aShow");

  switch (g.type) {
    case "new_follower":
      return { title: t("notifications.newFollowersGrouped", { names: nameList(g.actorNames, g.count, t) }) };
    case "ticket_sold":
      return {
        title: t("notifications.ticketSalesGrouped", { count: g.count, what }),
        detail: t("notifications.ticketSalesGroupedDetail"),
      };
    case "followed_artist_show":
      return { title: t("notifications.newShowsGrouped", { count: g.count }) };
    default:
      // tagged_in_event and event_upcoming don't repeat per show, so they
      // shouldn't reach here - fall back to the single-item wording rather
      // than inventing a plural for something that can't happen.
      return describeNotification(g.latest, t);
  }
}
