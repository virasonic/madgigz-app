import type { SupabaseClient } from "@supabase/supabase-js";
import { EventItem, EventRow, mapEvent } from "@/lib/types";
import type { Translate } from "@/lib/notifications";

// #149 Phase A: the fan-to-fan friends graph, read side.
//
// Everything here degrades to "no friends" on a database where addendum_059
// hasn't run yet (42P01 table missing, 42883 function missing), so the code can
// ship ahead of the hand-run migration without any friends surface falling
// over. See the addendum for the privacy model; in short, nothing about a fan
// is readable by anyone but their accepted friends, and only through the
// security-definer RPCs.

export type FriendStatus = "none" | "pending_out" | "pending_in" | "friends";

/** The minimal public identity of a fan: what a non-friend may see. */
export interface FanCard {
  id: string;
  username: string;
  photoUrl: string | null;
}

export interface FriendLink {
  profile: FanCard;
  status: Exclude<FriendStatus, "none">;
  /** Accepted date, for "friends since"; null while pending. */
  since: string | null;
}

interface FriendshipRow {
  user_a: string;
  user_b: string;
  requested_by: string;
  status: "pending" | "accepted";
  accepted_at: string | null;
  a: FanCardRow | null;
  b: FanCardRow | null;
}

interface FanCardRow {
  id: string;
  username: string;
  artist_photo_url: string | null;
}

function mapCard(row: FanCardRow): FanCard {
  return { id: row.id, username: row.username, photoUrl: row.artist_photo_url };
}

// PostgREST reports a table missing from its schema cache as PGRST205 and a
// missing function as PGRST202 (seen on prod before the migration ran); the
// raw Postgres codes are kept for the paths that surface them.
const MISSING = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);

/** Every friendship row involving `userId`: accepted, sent and received. */
export async function fetchFriendships(
  supabase: SupabaseClient,
  userId: string
): Promise<FriendLink[]> {
  const { data, error } = await supabase
    .from("friendships")
    .select(
      "user_a, user_b, requested_by, status, accepted_at, a:profiles!friendships_user_a_fkey(id, username, artist_photo_url), b:profiles!friendships_user_b_fkey(id, username, artist_photo_url)"
    )
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .order("accepted_at", { ascending: false, nullsFirst: true });

  if (error) {
    if (!MISSING.has(error.code)) console.error("fetchFriendships failed:", error);
    return [];
  }

  const links: FriendLink[] = [];
  for (const row of (data ?? []) as unknown as FriendshipRow[]) {
    const other = row.user_a === userId ? row.b : row.a;
    if (!other) continue;
    const status: FriendLink["status"] =
      row.status === "accepted"
        ? "friends"
        : row.requested_by === userId
          ? "pending_out"
          : "pending_in";
    links.push({ profile: mapCard(other), status, since: row.accepted_at });
  }
  return links;
}

export function friendStatusWith(links: FriendLink[], otherId: string): FriendStatus {
  return links.find((l) => l.profile.id === otherId)?.status ?? "none";
}

export type ActivityKind = "going" | "interested" | "been";

export interface FriendActivity {
  friendId: string;
  eventId: string;
  kind: ActivityKind;
  /** YYYY-MM-DD, from the event row. */
  eventDate: string;
}

/**
 * What the caller's accepted friends are going to / interested in / been to,
 * via the friend_activity RPC. Pass event ids to ask about specific shows (the
 * ticket sheet); omit for everything (the Friends tab, a friend's profile).
 */
export async function fetchFriendActivity(
  supabase: SupabaseClient,
  eventIds?: string[]
): Promise<FriendActivity[]> {
  if (eventIds && eventIds.length === 0) return [];
  const { data, error } = await supabase.rpc("friend_activity", {
    p_event_ids: eventIds ?? null,
  });
  if (error) {
    if (!MISSING.has(error.code)) console.error("fetchFriendActivity failed:", error);
    return [];
  }
  return ((data ?? []) as { friend_id: string; event_id: string; kind: ActivityKind; event_date: string }[]).map(
    (r) => ({ friendId: r.friend_id, eventId: r.event_id, kind: r.kind, eventDate: r.event_date })
  );
}

export interface FriendSuggestion {
  profile: FanCard;
  mutualCount: number;
}

/** Friends-of-friends, with how many friends you share. */
export async function fetchFriendSuggestions(supabase: SupabaseClient): Promise<FriendSuggestion[]> {
  const { data, error } = await supabase.rpc("friend_suggestions", { p_limit: 10 });
  if (error) {
    if (!MISSING.has(error.code)) console.error("fetchFriendSuggestions failed:", error);
    return [];
  }
  const rows = (data ?? []) as { profile_id: string; mutual_count: number }[];
  if (rows.length === 0) return [];
  const cards = await fetchFanCards(
    supabase,
    rows.map((r) => r.profile_id)
  );
  return rows
    .map((r) => ({ profile: cards[r.profile_id], mutualCount: r.mutual_count }))
    .filter((s): s is FriendSuggestion => Boolean(s.profile));
}

/** id -> card for a set of profiles. Username and photo are public columns. */
export async function fetchFanCards(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Record<string, FanCard>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return {};
  const { data } = await supabase
    .from("profiles")
    .select("id, username, artist_photo_url")
    .in("id", unique);
  const out: Record<string, FanCard> = {};
  for (const row of (data ?? []) as FanCardRow[]) out[row.id] = mapCard(row);
  return out;
}

export async function fetchFanCard(supabase: SupabaseClient, id: string): Promise<FanCard | null> {
  const cards = await fetchFanCards(supabase, [id]);
  return cards[id] ?? null;
}

/** Active, uncancelled events by id, in date order. */
export async function fetchEventsByIds(
  supabase: SupabaseClient,
  ids: string[]
): Promise<EventItem[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const { data } = await supabase
    .from("events")
    .select("*, venues(address)")
    .in("id", unique)
    .eq("active", true)
    .order("event_date");
  return ((data ?? []) as EventRow[]).filter((e) => !e.cancelled).map(mapEvent);
}

/** Whether friends may see the caller's hearted shows (default true). */
export async function fetchShareInterested(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("fan_preferences")
    .select("share_interested")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return true;
  return (data.share_interested as boolean | null) ?? true;
}

// ---- Sentences ----

/**
 * "Marta and Jon are going" / "Ana is interested" / "Pau, Nora and 3 others were
 * there". Names are usernames; the catalog carries the one/two/many forms per
 * kind so Spanish word order and agreement come out right.
 */
export function describeFriendsAtEvent(
  names: string[],
  kind: ActivityKind,
  t: Translate
): string | null {
  if (names.length === 0) return null;
  const [a, b] = names;
  if (names.length === 1) return t(`friends.${kind}One`, { a });
  if (names.length === 2) return t(`friends.${kind}Two`, { a, b });
  return t(`friends.${kind}Many`, { a, b, n: names.length - 2 });
}

/**
 * Groups one event's activity rows by kind, each friend counted once with
 * going winning over interested (a friend who hearted a show and then bought a
 * ticket is going, not both).
 */
export function splitByKind(rows: FriendActivity[]): Record<ActivityKind, string[]> {
  const going = new Set<string>();
  const been = new Set<string>();
  const interested = new Set<string>();
  for (const r of rows) {
    if (r.kind === "going") going.add(r.friendId);
    else if (r.kind === "been") been.add(r.friendId);
    else interested.add(r.friendId);
  }
  for (const id of going) interested.delete(id);
  return { going: [...going], interested: [...interested], been: [...been] };
}
