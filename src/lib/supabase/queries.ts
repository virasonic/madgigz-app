import type { SupabaseClient } from "@supabase/supabase-js";
import { ARTIST_CAPABLE_ROLES } from "@/lib/roles";
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
  mapPublicArtistProfile,
  mapTicket,
  AppUser,
  ProfileRow,
  PublicArtistProfile,
  PublicArtistProfileRow,
  Genre,
  Venue,
  VenueRow,
  mapVenue,
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
      "id, username, role, follower_count, artist_name, artist_bio, artist_photo_url, instagram, tiktok, twitter, spotify, youtube, artist_status, evidence_submitted, stripe_account_connected, stripe_payouts_ready"
    )
    .eq("id", user.id)
    .single();

  if (!data) return null;
  return mapProfile(data as ProfileRow, user.email ?? "");
}

// The fan-facing "who am I buying from" page. Only returns approved artists -
// a pending/rejected application or a plain fan account isn't a public page,
// so both come back as null rather than leaking status/role to a browsing fan.
export async function fetchArtistProfile(
  supabase: SupabaseClient,
  artistId: string
): Promise<PublicArtistProfile | null> {
  const { data } = await supabase
    .from("profiles")
    .select(
      "id, username, follower_count, artist_name, artist_bio, artist_photo_url, instagram, tiktok, twitter, spotify, youtube, role, artist_status"
    )
    .eq("id", artistId)
    .in("role", ARTIST_CAPABLE_ROLES)
    .eq("artist_status", "approved")
    .maybeSingle();

  if (!data) return null;
  return mapPublicArtistProfile(data as PublicArtistProfileRow);
}

// Madrid-only for now. The city column exists so opening a second city later
// is a filter change here rather than a migration.
export async function fetchVenues(
  supabase: SupabaseClient,
  options: { includeInactive?: boolean } = {}
): Promise<Venue[]> {
  let query = supabase.from("venues").select("*").order("name");
  if (!options.includeInactive) query = query.eq("active", true);
  const { data } = await query;
  return ((data as VenueRow[]) ?? []).map(mapVenue);
}

export async function fetchGenres(supabase: SupabaseClient): Promise<Genre[]> {
  const { data } = await supabase
    .from("genres")
    .select("id, name")
    .order("sort_order")
    .order("name");
  return (data as Genre[]) ?? [];
}

export async function fetchEventGenreIds(
  supabase: SupabaseClient,
  eventId: string
): Promise<string[]> {
  const { data } = await supabase
    .from("event_genres")
    .select("genre_id")
    .eq("event_id", eventId);
  return (data ?? []).map((row) => row.genre_id as string);
}

// Genre names for a single event. fetchGenresByEvent below is the bulk version
// Explore uses; pulling the whole join table to render one public page would be
// the wrong trade.
export async function fetchEventGenreNames(
  supabase: SupabaseClient,
  eventId: string
): Promise<string[]> {
  const { data } = await supabase
    .from("event_genres")
    .select("genres(name)")
    .eq("event_id", eventId);
  return ((data ?? []) as unknown as { genres: { name: string } | null }[])
    .map((row) => row.genres?.name)
    .filter((name): name is string => Boolean(name));
}

// Genres for many events at once - Explore needs them for every card, and one
// query beats one per event.
export async function fetchGenresByEvent(
  supabase: SupabaseClient
): Promise<Record<string, string[]>> {
  const { data } = await supabase.from("event_genres").select("event_id, genres(name)");
  const byEvent: Record<string, string[]> = {};
  ((data ?? []) as unknown as { event_id: string; genres: { name: string } | null }[]).forEach(
    (row) => {
      if (!row.genres) return;
      byEvent[row.event_id] = [...(byEvent[row.event_id] ?? []), row.genres.name];
    }
  );
  return byEvent;
}

// Only approved artists, matching what the public profile page will actually
// serve - a search hit on a pending or rejected artist would 404 on tap.
export async function fetchApprovedArtists(
  supabase: SupabaseClient
): Promise<PublicArtistProfile[]> {
  const { data } = await supabase
    .from("profiles")
    .select(
      "id, username, follower_count, artist_name, artist_bio, artist_photo_url, instagram, tiktok, twitter, spotify, youtube, role, artist_status"
    )
    .in("role", ARTIST_CAPABLE_ROLES)
    .eq("artist_status", "approved")
    .order("artist_name");

  return ((data as PublicArtistProfileRow[]) ?? []).map(mapPublicArtistProfile);
}

// Which of these artists the current user follows. One query for the whole
// list rather than one per card - Explore renders every approved artist.
export async function fetchFollowedArtistIds(
  supabase: SupabaseClient,
  userId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("follows")
    .select("artist_id")
    .eq("follower_id", userId);

  // 42P01 = table missing, i.e. addendum_021 hasn't been run yet. Following
  // simply does nothing until it lands, rather than breaking the page.
  if (error?.code === "42P01") return [];
  return (data ?? []).map((row) => row.artist_id as string);
}

// Every event connected to an artist the user follows - shows they own, and
// shows they're only tagged on. The tag half matters: a MadGigz house show has
// no artist_id at all, so ranking on ownership alone would ignore exactly the
// shows the admin panel creates.
export async function fetchFollowedEventIds(
  supabase: SupabaseClient,
  userId: string
): Promise<Set<string>> {
  const followed = await fetchFollowedArtistIds(supabase, userId);
  if (followed.length === 0) return new Set();

  const [{ data: owned }, { data: tagged }] = await Promise.all([
    supabase.from("events").select("id").in("artist_id", followed),
    supabase.from("event_artists").select("event_id").in("profile_id", followed),
  ]);

  return new Set([
    ...(owned ?? []).map((row) => row.id as string),
    ...(tagged ?? []).map((row) => row.event_id as string),
  ]);
}

export async function fetchEvents(
  supabase: SupabaseClient,
  options: { activeOnly?: boolean; city?: string; upcomingOnly?: boolean } = {}
): Promise<EventItem[]> {
  // The venue embed carries the address through to the ticket and the public
  // page, where it becomes a maps link. One join beats a lookup per event.
  let query = supabase.from("events").select("*, venues(address)").order("event_date");
  if (options.activeOnly) query = query.eq("active", true);
  // #141: Explore is discovery of what's *still to come*, so drop past shows.
  // Date-only compare in UTC (event_date is a plain date), same "today" the
  // profile/ticket splits use; >= keeps a show live through its own day.
  if (options.upcomingOnly) {
    query = query.gte("event_date", new Date().toISOString().slice(0, 10));
  }
  // #90: the fan surfaces are local - only show what's on in the current city.
  // A no-op while every show is in Madrid, but it makes "what's on in Madrid"
  // literally true and stops a stray out-of-city show leaking into the feed.
  if (options.city) query = query.eq("city", options.city);
  const { data } = await query;
  return ((data as EventRow[]) ?? []).map(mapEvent);
}

// Used by the public /e/[id] page, so this runs unauthenticated as often as
// not. That's fine - "Events are viewable by everyone" is a real select policy,
// not an accident - but it does mean nothing sensitive may be added to events.
export async function fetchEventById(
  supabase: SupabaseClient,
  eventId: string
): Promise<EventItem | null> {
  const { data } = await supabase
    .from("events")
    .select("*, venues(address)")
    .eq("id", eventId)
    .maybeSingle();
  return data ? mapEvent(data as EventRow) : null;
}

export async function fetchContentPosts(supabase: SupabaseClient): Promise<ContentPost[]> {
  // select("*") already includes the headline/accent_color columns added in
  // addendum_029, so text announcements come through with no query change.
  // The profiles embed rides the artist_id FK for the reel avatar (#123);
  // artist_photo_url is already public-API-readable, so no new grant.
  const { data } = await supabase
    .from("content_posts")
    .select("*, profiles(artist_photo_url)")
    // Moderation-hidden posts (addendum_031) drop out of the feed but stay in
    // the table for the report trail.
    .is("hidden_at", null)
    .order("created_at", { ascending: false });
  // Intro reels (#143) live on the artist's profile, not in For You. Filtered in
  // JS rather than the query so a pre-addendum_038 DB (no is_intro column) still
  // returns the feed instead of erroring; isIntro reads false there anyway.
  return ((data as ContentPostRow[]) ?? []).map(mapContentPost).filter((p) => !p.isIntro);
}

/**
 * The artist's pinned introduction reel (#143), or null if they haven't set one.
 * Returns null — degrading silently — if the column doesn't exist yet
 * (addendum_038 not run) so the profile still renders in the deploy→migration
 * gap.
 */
export async function fetchArtistIntro(
  supabase: SupabaseClient,
  artistId: string
): Promise<ContentPost | null> {
  const { data, error } = await supabase
    .from("content_posts")
    .select("*, profiles(artist_photo_url)")
    .eq("artist_id", artistId)
    .eq("is_intro", true)
    .is("hidden_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return mapContentPost(data as ContentPostRow);
}

export async function fetchShowContent(
  supabase: SupabaseClient,
  eventId: string
): Promise<ContentPost[]> {
  const { data } = await supabase
    .from("content_posts")
    .select("*, profiles(artist_photo_url)")
    .eq("event_id", eventId)
    .is("hidden_at", null)
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

// Returns whether the write actually landed, so callers can roll back their
// optimistic UI instead of showing a heart that isn't saved. A delete blocked
// by RLS matches zero rows and returns no error, so the .select() is what
// makes a silent refusal detectable - same pattern as show/ticket hiding.
export async function toggleSavedEvent(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
  currentlySaved: boolean
): Promise<boolean> {
  if (currentlySaved) {
    const { data, error } = await supabase
      .from("saved_events")
      .delete()
      .eq("user_id", userId)
      .eq("event_id", eventId)
      .select("event_id");
    return !error && (data?.length ?? 0) > 0;
  }

  const { error } = await supabase
    .from("saved_events")
    .insert({ user_id: userId, event_id: eventId });
  // A duplicate key means it was already saved - the desired end state either
  // way, so don't treat it as a failure and bounce the heart back.
  return !error || error.code === "23505";
}

export async function fetchTickets(
  supabase: SupabaseClient,
  userId: string
): Promise<Ticket[]> {
  const { data } = await supabase
    .from("tickets")
    .select("*")
    .eq("user_id", userId)
    .is("hidden_at", null)
    .order("purchased_at", { ascending: false });
  return ((data as TicketRow[]) ?? []).map(mapTicket);
}

/**
 * ticketId → claim token for the caller's own tickets that have a transfer
 * link out (#145). Drives the "transfer pending" badge and the cancel button in
 * the ticket sheet. RLS scopes the ticket_transfers rows to from_user_id, so
 * this only ever returns the caller's own. Returns {} — degrading silently — if
 * the table isn't there yet (42P01, addendum_037 not run) so the app works in
 * the gap between deploy and migration.
 */
export async function fetchPendingTransfers(
  supabase: SupabaseClient
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("ticket_transfers")
    .select("ticket_id, token")
    .eq("status", "pending");
  if (error) return {};
  const map: Record<string, string> = {};
  for (const row of (data ?? []) as { ticket_id: string; token: string }[]) {
    map[row.ticket_id] = row.token;
  }
  return map;
}

export async function validateDiscountCode(
  supabase: SupabaseClient,
  code: string,
  eventId: string
): Promise<Discount | null> {
  // Exact match, not ilike: `%` and `_` are LIKE wildcards, so a promo code of
  // "%" would otherwise match every discount in the table (and then blow up in
  // maybeSingle). Admin stores codes uppercased.
  const { data } = await supabase
    .from("discounts")
    .select("*")
    .eq("code", code.trim().toUpperCase())
    .eq("active", true)
    .maybeSingle();

  if (!data) return null;
  const discount = mapDiscount(data as DiscountRow);

  if (discount.eventId && discount.eventId !== eventId) return null;
  if (discount.expiresAt && new Date(discount.expiresAt).getTime() < Date.now()) return null;
  if (discount.maxUses !== null && discount.usedCount >= discount.maxUses) return null;

  return discount;
}

export function applyDiscount(subtotal: number, discount: Discount | null): number {
  if (!discount) return subtotal;
  const discounted =
    discount.type === "percent"
      ? subtotal * (1 - discount.value / 100)
      : subtotal - discount.value;
  return Math.max(0, Math.round(discounted * 100) / 100);
}

export interface ShowBuyer {
  ticketId: string;
  username: string;
  quantity: number;
  pricePaid: number;
  purchasedAt: string;
  checkedInAt: string | null;
  refunded: boolean;
}

// RLS ("Artists can view tickets for their own events") scopes this to the
// caller's own shows - an artist asking for someone else's event id just
// gets an empty list back rather than an error.
export async function fetchShowBuyers(
  supabase: SupabaseClient,
  eventId: string
): Promise<ShowBuyer[]> {
  const { data: tickets } = await supabase
    .from("tickets")
    .select("*")
    .eq("event_id", eventId)
    .order("purchased_at", { ascending: false });

  const rows = (tickets as TicketRow[]) ?? [];
  if (rows.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, username")
    .in("id", [...new Set(rows.map((t) => t.user_id))]);

  const usernameById = new Map((profiles ?? []).map((p) => [p.id, p.username as string]));

  return rows.map((t) => ({
    ticketId: t.id,
    username: usernameById.get(t.user_id) ?? "-",
    quantity: t.quantity,
    pricePaid: Number(t.price_paid),
    purchasedAt: t.purchased_at,
    checkedInAt: t.checked_in_at,
    refunded: t.refunded,
  }));
}

export interface ShowTicketCounts {
  /** Every ticket row ever written for this show, refunded ones included. */
  total: number;
  /** Tickets that still entitle someone to walk in - i.e. not refunded. */
  live: number;
}

// `events.sold` is a live capacity counter: a refund decrements it, so a show
// that sold out and was fully refunded reads `sold = 0` while its ticket rows
// are still on file. The delete policy cares about the rows, not the counter,
// so anything deciding whether a show can be deleted has to ask this instead.
export async function fetchShowTicketCounts(
  supabase: SupabaseClient,
  eventId: string
): Promise<ShowTicketCounts> {
  const { data } = await supabase.from("tickets").select("refunded").eq("event_id", eventId);
  const rows = (data ?? []) as { refunded: boolean }[];
  return { total: rows.length, live: rows.filter((row) => !row.refunded).length };
}

// Which platform artists are tagged on a show. Ids only - the lineup names
// themselves still live on events.lineup, so an untagged act keeps working.
export async function fetchTaggedArtistIds(
  supabase: SupabaseClient,
  eventId: string
): Promise<string[]> {
  const { data } = await supabase
    .from("event_artists")
    .select("profile_id")
    .eq("event_id", eventId);
  return (data ?? []).map((row) => row.profile_id as string);
}

// Shows an artist was tagged on but doesn't own. Kept separate from
// fetchShowsByArtist so the Manage view can never offer management controls on
// a show that isn't theirs.
export async function fetchTaggedShows(
  supabase: SupabaseClient,
  artistId: string
): Promise<EventItem[]> {
  const { data } = await supabase
    .from("event_artists")
    .select("events(*, venues(address))")
    .eq("profile_id", artistId);

  return ((data ?? []) as unknown as { events: EventRow | null }[])
    .map((row) => row.events)
    .filter((event): event is EventRow => Boolean(event) && event!.artist_id !== artistId)
    .map(mapEvent)
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Shows the fan actually turned up to - a ticket scanned at the door
// (checked_in_at set), joined to its event. Powers the past-events poster wall
// on the fan profile (#116). "Attended" means scanned in, not "the date has
// passed", matching attendedCount and the Tickets tab's "Where you've been"
// (SavedClient) - a ticket bought and never used isn't a gig you were at.
// hidden_at is respected so the wall matches the count, and events are
// de-duplicated (two tickets to one show is still one memory) and shown newest
// first.
export async function fetchAttendedEvents(
  supabase: SupabaseClient,
  userId: string
): Promise<EventItem[]> {
  const { data } = await supabase
    .from("tickets")
    .select("checked_in_at, events(*, venues(address))")
    .eq("user_id", userId)
    .not("checked_in_at", "is", null)
    .is("hidden_at", null);

  const seen = new Set<string>();
  return ((data ?? []) as unknown as { events: EventRow | null }[])
    .map((row) => row.events)
    .filter((event): event is EventRow => Boolean(event))
    .filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    })
    .map(mapEvent)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function fetchShowsByArtist(
  supabase: SupabaseClient,
  artistId: string
): Promise<EventItem[]> {
  const { data } = await supabase
    .from("events")
    .select("*, venues(address)")
    .eq("artist_id", artistId)
    .order("event_date");
  return ((data as EventRow[]) ?? []).map(mapEvent);
}
