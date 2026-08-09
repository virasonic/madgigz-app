import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { toCents } from "@/lib/pricing";
import {
  ArtistStatus,
  DiscountRow,
  EventItem,
  EventRow,
  mapDiscount,
  mapEvent,
  TicketRow,
} from "@/lib/types";

// Verifies the current session belongs to an admin. Every admin page/action
// calls this first - throws (caught by Next's error boundary) rather than
// silently returning partial data if the check fails.
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") throw new Error("Not authorized");
  return user;
}

export interface AdminUserRow {
  id: string;
  email: string;
  username: string;
  role: string;
  createdAt: string;
  lastSignInAt: string | null;
  ticketCount: number;
  deletionRequestedAt: string | null;
  deletedAt: string | null;
}

export async function fetchAllUsers(admin: SupabaseClient): Promise<AdminUserRow[]> {
  const { data: authData } = await admin.auth.admin.listUsers();
  const { data: profileRows } = await admin
    .from("profiles")
    .select("id, username, role, created_at, deletion_requested_at, deleted_at");
  const { data: ticketRows } = await admin.from("tickets").select("user_id");

  const ticketCounts = new Map<string, number>();
  (ticketRows ?? []).forEach((row: { user_id: string }) => {
    ticketCounts.set(row.user_id, (ticketCounts.get(row.user_id) ?? 0) + 1);
  });

  const profileById = new Map((profileRows ?? []).map((p) => [p.id, p]));

  return (authData?.users ?? []).map((u) => {
    const profile = profileById.get(u.id);
    return {
      id: u.id,
      email: u.email ?? "",
      username: profile?.username ?? "-",
      role: profile?.role ?? "fan",
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      ticketCount: ticketCounts.get(u.id) ?? 0,
      deletionRequestedAt: (profile?.deletion_requested_at as string | null) ?? null,
      deletedAt: (profile?.deleted_at as string | null) ?? null,
    };
  });
}

export async function fetchDashboardStats(admin: SupabaseClient) {
  const [{ count: userCount }, { count: eventCount }, { count: pendingArtistCount }, { data: tickets }] =
    await Promise.all([
      admin.from("profiles").select("*", { count: "exact", head: true }),
      admin.from("events").select("*", { count: "exact", head: true }),
      admin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "artist")
        .eq("artist_status", "pending"),
      admin.from("tickets").select("quantity, price_paid, purchased_at"),
    ]);

  const ticketsSold = (tickets ?? []).reduce((sum, t) => sum + t.quantity, 0);
  const revenue = (tickets ?? []).reduce((sum, t) => sum + Number(t.price_paid), 0);

  const { data: profileDates } = await admin.from("profiles").select("created_at");
  const signupsByDay = new Map<string, number>();
  (profileDates ?? []).forEach((p) => {
    const day = new Date(p.created_at).toISOString().slice(0, 10);
    signupsByDay.set(day, (signupsByDay.get(day) ?? 0) + 1);
  });

  return {
    userCount: userCount ?? 0,
    eventCount: eventCount ?? 0,
    pendingArtistCount: pendingArtistCount ?? 0,
    ticketsSold,
    revenue,
    signupsByDay: Array.from(signupsByDay.entries()).sort(([a], [b]) => a.localeCompare(b)),
  };
}

export interface AdminArtistApplication {
  id: string;
  email: string;
  username: string;
  artistName: string | null;
  instagram: string | null;
  tiktok: string | null;
  twitter: string | null;
  spotify: string | null;
  youtube: string | null;
  /** Short-lived signed URL, minted per page load - the file lives in a private
   *  bucket and has no public URL. */
  evidenceUrl: string | null;
  artistStatus: ArtistStatus;
  stripeAccountId: string | null;
  stripePayoutsReady: boolean;
  createdAt: string;
}

export async function fetchArtistApplications(
  admin: SupabaseClient
): Promise<AdminArtistApplication[]> {
  const { data: authData } = await admin.auth.admin.listUsers();
  const { data: profileRows } = await admin
    .from("profiles")
    .select(
      "id, username, artist_name, instagram, tiktok, twitter, spotify, youtube, artist_status, stripe_account_id, stripe_payouts_ready, created_at"
    )
    .eq("role", "artist");

  const emailById = new Map((authData?.users ?? []).map((u) => [u.id, u.email ?? ""]));

  // Evidence paths live in their own table, not on profiles - profiles is
  // readable by everyone, so a column there would have put verification
  // documents on the open internet.
  const { data: evidenceRows } = await admin
    .from("artist_evidence")
    .select("profile_id, storage_path");

  const signedByProfile = new Map<string, string>();
  await Promise.all(
    (evidenceRows ?? []).map(async (row) => {
      const { data: signed } = await admin.storage
        .from("artist-evidence")
        // An hour is plenty to look at it, and the link dies afterwards rather
        // than being forwardable forever.
        .createSignedUrl(row.storage_path as string, 60 * 60);
      if (signed?.signedUrl) signedByProfile.set(row.profile_id as string, signed.signedUrl);
    })
  );

  const applications = (profileRows ?? []).map((p) => ({
    id: p.id,
    email: emailById.get(p.id) ?? "",
    username: p.username,
    artistName: p.artist_name,
    instagram: p.instagram,
    tiktok: p.tiktok,
    twitter: p.twitter,
    spotify: p.spotify,
    youtube: p.youtube,
    evidenceUrl: signedByProfile.get(p.id as string) ?? null,
    artistStatus: (p.artist_status ?? "approved") as ArtistStatus,
    stripeAccountId: p.stripe_account_id,
    stripePayoutsReady: p.stripe_payouts_ready ?? false,
    createdAt: p.created_at,
  }));

  const statusOrder: Record<ArtistStatus, number> = { pending: 0, rejected: 1, approved: 2 };
  return applications.sort((a, b) => statusOrder[a.artistStatus] - statusOrder[b.artistStatus]);
}

export interface AdminVenue {
  id: string;
  name: string;
  address: string | null;
  city: string;
  postalCode: string | null;
  capacity: number | null;
  verified: boolean;
  active: boolean;
  showCount: number;
  upcomingCount: number;
  ticketsSold: number;
}

// Venue list with the numbers that make it worth having a tab: how much is
// actually being advertised there, and how much of it has sold.
export async function fetchVenuesAdmin(admin: SupabaseClient): Promise<AdminVenue[]> {
  const [{ data: venues }, { data: events }] = await Promise.all([
    admin.from("venues").select("*").order("verified").order("name"),
    admin.from("events").select("id, venue_id, event_date, sold, cancelled"),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  return ((venues ?? []) as Record<string, unknown>[]).map((v) => {
    const mine = ((events ?? []) as Record<string, unknown>[]).filter(
      (e) => e.venue_id === v.id && !e.cancelled
    );
    return {
      id: v.id as string,
      name: v.name as string,
      address: (v.address as string) ?? null,
      city: v.city as string,
      postalCode: (v.postal_code as string) ?? null,
      capacity: (v.capacity as number) ?? null,
      verified: v.verified as boolean,
      active: v.active as boolean,
      showCount: mine.length,
      upcomingCount: mine.filter((e) => (e.event_date as string) >= today).length,
      ticketsSold: mine.reduce((sum, e) => sum + ((e.sold as number) ?? 0), 0),
    };
  });
}

export async function fetchAllEventsAdmin(admin: SupabaseClient) {
  const { data } = await admin.from("events").select("*").order("event_date");
  return ((data as EventRow[]) ?? []).map(mapEvent);
}

export interface AdminTicketRow {
  id: string;
  username: string;
  eventTitle: string;
  quantity: number;
  pricePaid: number;
  /** Total deducted from the artist: commission + IVA. */
  feeCents: number;
  /** The IVA portion - owed to Hacienda, not revenue. */
  feeVatCents: number;
  refunded: boolean;
  purchasedAt: string;
}

export async function fetchAllTicketsAdmin(admin: SupabaseClient): Promise<AdminTicketRow[]> {
  const { data: tickets } = await admin
    .from("tickets")
    .select("*")
    .order("purchased_at", { ascending: false });
  const { data: profiles } = await admin.from("profiles").select("id, username");
  const { data: events } = await admin.from("events").select("id, title");

  const usernameById = new Map((profiles ?? []).map((p) => [p.id, p.username]));
  const titleById = new Map((events ?? []).map((e) => [e.id, e.title]));

  type FeeRow = TicketRow & {
    application_fee_cents: number | null;
    application_fee_vat_cents: number | null;
  };

  return ((tickets as FeeRow[]) ?? []).map((t) => ({
    id: t.id,
    username: usernameById.get(t.user_id) ?? "-",
    eventTitle: titleById.get(t.event_id) ?? "-",
    quantity: t.quantity,
    pricePaid: Number(t.price_paid),
    feeCents: Number(t.application_fee_cents ?? 0),
    feeVatCents: Number(t.application_fee_vat_cents ?? 0),
    refunded: t.refunded,
    purchasedAt: t.purchased_at,
  }));
}

export async function fetchAllDiscounts(admin: SupabaseClient) {
  const { data } = await admin.from("discounts").select("*").order("created_at", { ascending: false });
  return ((data as DiscountRow[]) ?? []).map(mapDiscount);
}

export interface AdminEventOrder {
  ticketId: string;
  username: string;
  quantity: number;
  pricePaidCents: number;
  feeCents: number;
  feeVatCents: number;
  discountCode: string | null;
  refunded: boolean;
  checkedInAt: string | null;
  purchasedAt: string;
}

export interface AdminEventDiscountUsage {
  code: string;
  type: "percent" | "fixed";
  value: number;
  timesUsed: number;
  /** Euros given away by this code on this event, non-refunded orders only -
   *  a refund unwinds the whole order, discount included. */
  discountGivenCents: number;
}

export interface AdminEventDaySales {
  day: string;
  tickets: number;
  revenueCents: number;
}

export interface AdminEventDetail {
  event: EventItem;
  stats: {
    ordersCount: number;
    ticketsSold: number;
    grossCents: number;
    feeCents: number;
    feeVatCents: number;
    netToArtistCents: number;
    refundedOrders: number;
    refundedCents: number;
    checkedInCount: number;
  };
  orders: AdminEventOrder[];
  discountUsage: AdminEventDiscountUsage[];
  dailySales: AdminEventDaySales[];
}

// Everything one event's admin detail page needs, in one round trip per
// related table rather than N+1 per ticket.
export async function fetchEventDetail(
  admin: SupabaseClient,
  eventId: string
): Promise<AdminEventDetail | null> {
  const { data: eventRow } = await admin.from("events").select("*").eq("id", eventId).single();
  if (!eventRow) return null;
  const event = mapEvent(eventRow as EventRow);

  const { data: ticketRows } = await admin
    .from("tickets")
    .select("*")
    .eq("event_id", eventId)
    .order("purchased_at", { ascending: false });

  type FeeRow = TicketRow & {
    application_fee_cents: number | null;
    application_fee_vat_cents: number | null;
  };
  const tickets = (ticketRows as FeeRow[]) ?? [];

  const userIds = [...new Set(tickets.map((t) => t.user_id))];
  const { data: profileRows } =
    userIds.length > 0
      ? await admin.from("profiles").select("id, username").in("id", userIds)
      : { data: [] as { id: string; username: string }[] };
  const usernameById = new Map((profileRows ?? []).map((p) => [p.id, p.username as string]));

  const discountIds = [...new Set(tickets.map((t) => t.discount_id).filter(Boolean))] as string[];
  const { data: discountRows } =
    discountIds.length > 0
      ? await admin.from("discounts").select("*").in("id", discountIds)
      : { data: [] as DiscountRow[] };
  const discountById = new Map(
    ((discountRows as DiscountRow[]) ?? []).map((d) => [d.id, mapDiscount(d)])
  );

  const orders: AdminEventOrder[] = tickets.map((t) => ({
    ticketId: t.id,
    username: usernameById.get(t.user_id) ?? "-",
    quantity: t.quantity,
    pricePaidCents: toCents(Number(t.price_paid)),
    feeCents: Number(t.application_fee_cents ?? 0),
    feeVatCents: Number(t.application_fee_vat_cents ?? 0),
    discountCode: t.discount_id ? (discountById.get(t.discount_id)?.code ?? null) : null,
    refunded: t.refunded,
    checkedInAt: t.checked_in_at,
    purchasedAt: t.purchased_at,
  }));

  // Refunded orders gave the money back, so they're excluded from every total
  // below - same convention as /admin/billing.
  const live = orders.filter((o) => !o.refunded);
  const refunded = orders.filter((o) => o.refunded);

  const stats = {
    ordersCount: orders.length,
    ticketsSold: live.reduce((sum, o) => sum + o.quantity, 0),
    grossCents: live.reduce((sum, o) => sum + o.pricePaidCents, 0),
    feeCents: live.reduce((sum, o) => sum + o.feeCents, 0),
    feeVatCents: live.reduce((sum, o) => sum + o.feeVatCents, 0),
    netToArtistCents: live.reduce((sum, o) => sum + (o.pricePaidCents - o.feeCents), 0),
    refundedOrders: refunded.length,
    refundedCents: refunded.reduce((sum, o) => sum + o.pricePaidCents, 0),
    checkedInCount: live.filter((o) => o.checkedInAt).length,
  };

  // Grouped by discount_id (not the code string) so two different codes that
  // happen to share text can never merge into one row.
  const discountUsageById = new Map<string, { timesUsed: number; discountGivenCents: number }>();
  for (const t of tickets) {
    if (t.refunded || !t.discount_id) continue;
    const undiscountedCents = toCents(event.price) * t.quantity;
    const paidCents = toCents(Number(t.price_paid));
    const givenCents = Math.max(undiscountedCents - paidCents, 0);
    const existing = discountUsageById.get(t.discount_id);
    if (existing) {
      existing.timesUsed += 1;
      existing.discountGivenCents += givenCents;
    } else {
      discountUsageById.set(t.discount_id, { timesUsed: 1, discountGivenCents: givenCents });
    }
  }
  const discountUsage: AdminEventDiscountUsage[] = [...discountUsageById.entries()]
    .map(([discountId, agg]) => {
      const discount = discountById.get(discountId);
      return {
        code: discount?.code ?? "(deleted code)",
        type: discount?.type ?? ("fixed" as const),
        value: discount?.value ?? 0,
        timesUsed: agg.timesUsed,
        discountGivenCents: agg.discountGivenCents,
      };
    })
    .sort((a, b) => b.timesUsed - a.timesUsed);

  // Grouped by UTC calendar day of purchase, oldest first - a simple sales
  // timeline without pulling in a charting library.
  const dailyMap = new Map<string, { tickets: number; revenueCents: number }>();
  for (const o of live) {
    const day = o.purchasedAt.slice(0, 10);
    const existing = dailyMap.get(day);
    if (existing) {
      existing.tickets += o.quantity;
      existing.revenueCents += o.pricePaidCents;
    } else {
      dailyMap.set(day, { tickets: o.quantity, revenueCents: o.pricePaidCents });
    }
  }
  const dailySales: AdminEventDaySales[] = [...dailyMap.entries()]
    .map(([day, v]) => ({ day, ...v }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return { event, stats, orders, discountUsage, dailySales };
}

export function adminClient() {
  return createAdminClient();
}
