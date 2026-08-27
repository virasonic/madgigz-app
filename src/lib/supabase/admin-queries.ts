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
  artistPhotoUrl: string | null;
}

export async function fetchAllUsers(admin: SupabaseClient): Promise<AdminUserRow[]> {
  const { data: authData } = await admin.auth.admin.listUsers();
  const { data: profileRows } = await admin
    .from("profiles")
    .select(
      "id, username, role, created_at, deletion_requested_at, deleted_at, artist_photo_url"
    );
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
      artistPhotoUrl: (profile?.artist_photo_url as string | null) ?? null,
    };
  });
}

export async function fetchDashboardStats(admin: SupabaseClient) {
  const [{ count: userCount }, { count: eventCount }, { count: pendingArtistCount }, { data: tickets }] =
    await Promise.all([
      // Tombstoned (purged) accounts aren't real users any more, so they don't
      // count toward the total.
      admin.from("profiles").select("*", { count: "exact", head: true }).is("deleted_at", null),
      admin.from("events").select("*", { count: "exact", head: true }),
      admin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("role", "artist")
        .eq("artist_status", "pending"),
      admin.from("tickets").select("quantity, price_paid, purchased_at, refunded"),
    ]);

  // Net tickets sold (refunds removed) is the headline; the gross total is kept
  // for the "(N)" in brackets. Revenue already excludes refunds - that money
  // went back to the buyer.
  const ticketsSoldTotal = (tickets ?? []).reduce((sum, t) => sum + t.quantity, 0);
  const ticketsSold = (tickets ?? [])
    .filter((t) => !t.refunded)
    .reduce((sum, t) => sum + t.quantity, 0);
  const revenue = (tickets ?? [])
    .filter((t) => !t.refunded)
    .reduce((sum, t) => sum + Number(t.price_paid), 0);

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
    ticketsSoldTotal,
    revenue,
    // Most recent day first, so the newest signups sit at the top of the list.
    signupsByDay: Array.from(signupsByDay.entries()).sort(([a], [b]) => b.localeCompare(a)),
  };
}

export interface StorageBucketUsage {
  bucket: string;
  bytes: number;
  files: number;
}

export interface StorageUsage {
  totalBytes: number;
  buckets: StorageBucketUsage[];
}

// Rolls up file storage per bucket via the admin_storage_usage() RPC
// (addendum_034), which is the only way to reach storage.objects - that table
// lives in the `storage` schema, which PostgREST doesn't expose. Returns zeros
// (rather than throwing) if the migration hasn't run yet, so the dashboard
// still renders during the window between deploy and running the SQL.
export async function fetchStorageUsage(admin: SupabaseClient): Promise<StorageUsage> {
  const { data, error } = await admin.rpc("admin_storage_usage");

  if (error) {
    // 42883 = function doesn't exist, i.e. addendum_034 hasn't run.
    if (error.code !== "42883") console.error("fetchStorageUsage failed:", error);
    return { totalBytes: 0, buckets: [] };
  }

  const buckets: StorageBucketUsage[] = (
    (data ?? []) as { bucket_id: string; bytes: number; files: number }[]
  ).map((r) => ({
    bucket: r.bucket_id,
    bytes: Number(r.bytes),
    files: Number(r.files),
  }));

  return {
    totalBytes: buckets.reduce((sum, b) => sum + b.bytes, 0),
    buckets,
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

export interface EventInterest {
  saves: number;
  clicks: number;
  shares: number;
}

export async function fetchAllEventsAdmin(
  admin: SupabaseClient
): Promise<{ events: EventItem[]; interest: Record<string, EventInterest> }> {
  const { data } = await admin.from("events").select("*").order("event_date");
  const events = ((data as EventRow[]) ?? []).map(mapEvent);

  // Interest signals per event, aggregated in one pass each (two queries total,
  // not N-per-event). Fine at launch volume; if saved_events / event_link_clicks
  // grow large, move this to a grouped DB view. event_link_clicks may be absent
  // pre-addendum_044 (→ empty), and its `kind` column absent pre-045 (select *
  // just omits it → counted as a click, which is what it was).
  const interest: Record<string, EventInterest> = {};
  const bump = (id: string, key: keyof EventInterest) => {
    (interest[id] ??= { saves: 0, clicks: 0, shares: 0 })[key] += 1;
  };

  const { data: saves } = await admin.from("saved_events").select("event_id");
  for (const s of (saves as { event_id: string }[]) ?? []) bump(s.event_id, "saves");

  const { data: clicks } = await admin.from("event_link_clicks").select("*");
  for (const c of (clicks as { event_id: string; kind?: string | null }[]) ?? []) {
    bump(c.event_id, c.kind === "share" ? "shares" : "clicks");
  }

  return { events, interest };
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
    savesCount: number;
    clicksCount: number;
    sharesCount: number;
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

  // Interest signals shown next to sales. Saves come from the existing
  // saved_events table. Ticket clicks + shares share the event_link_clicks table
  // (addendum_044/045), split by `kind`. Clicks = total − shares, which is
  // correct both before addendum_045 (no kind column → the shares query errors →
  // 0 → clicks = total) and after; a missing table (pre-044) → null counts → 0.
  const { count: savesCount } = await admin
    .from("saved_events")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId);
  const { count: interactionsTotal } = await admin
    .from("event_link_clicks")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId);
  const { count: sharesRaw } = await admin
    .from("event_link_clicks")
    .select("*", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("kind", "share");
  const sharesCount = sharesRaw ?? 0;
  const clicksCount = Math.max(0, (interactionsTotal ?? 0) - sharesCount);

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
    savesCount: savesCount ?? 0,
    clicksCount,
    sharesCount,
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

export interface AdminReportRow {
  id: string;
  reason: string;
  detail: string | null;
  status: string;
  adminNote: string | null;
  createdAt: string;
  reporterUsername: string | null;
  postId: string;
  postHidden: boolean;
  postCaption: string;
  postHeadline: string | null;
  postMediaUrl: string | null;
  postMediaType: string;
  postArtistName: string;
  postArtistId: string | null;
  postEventId: string | null;
}

export async function fetchContentReports(admin: SupabaseClient): Promise<AdminReportRow[]> {
  const { data, error } = await admin
    .from("content_reports")
    .select(
      "id, reason, detail, status, admin_note, created_at, reporter:profiles!content_reports_reporter_id_fkey(username), content_posts(id, caption, headline, media_url, media_type, artist_name, artist_id, event_id, hidden_at)"
    )
    .order("created_at", { ascending: false });

  // 42P01 = addendum_031 not run yet. Empty queue beats a thrown admin panel.
  if (error) {
    if (error.code !== "42P01") console.error("fetchContentReports failed:", error);
    return [];
  }

  type Row = {
    id: string;
    reason: string;
    detail: string | null;
    status: string;
    admin_note: string | null;
    created_at: string;
    reporter: { username: string } | null;
    content_posts: {
      id: string;
      caption: string;
      headline: string | null;
      media_url: string | null;
      media_type: string;
      artist_name: string;
      artist_id: string | null;
      event_id: string | null;
      hidden_at: string | null;
    } | null;
  };

  return ((data ?? []) as unknown as Row[])
    // A report whose post was hard-deleted has nothing to act on.
    .filter((r) => r.content_posts)
    .map((r) => ({
      id: r.id,
      reason: r.reason,
      detail: r.detail,
      status: r.status,
      adminNote: r.admin_note,
      createdAt: r.created_at,
      reporterUsername: r.reporter?.username ?? null,
      postId: r.content_posts!.id,
      postHidden: Boolean(r.content_posts!.hidden_at),
      postCaption: r.content_posts!.caption,
      postHeadline: r.content_posts!.headline,
      postMediaUrl: r.content_posts!.media_url,
      postMediaType: r.content_posts!.media_type,
      postArtistName: r.content_posts!.artist_name,
      postArtistId: r.content_posts!.artist_id,
      postEventId: r.content_posts!.event_id,
    }));
}

export async function fetchOpenReportCount(admin: SupabaseClient): Promise<number> {
  const { count, error } = await admin
    .from("content_reports")
    .select("id", { count: "exact", head: true })
    .eq("status", "open");
  if (error) return 0;
  return count ?? 0;
}

export interface AdminFeedbackRow {
  id: string;
  type: string;
  message: string;
  route: string | null;
  status: string;
  adminNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  contactEmail: string | null;
  roleAtSubmission: string | null;
  /** Null once the account has been deleted - the message deliberately stays. */
  userId: string | null;
  username: string | null;
}

export async function fetchAllFeedback(admin: SupabaseClient): Promise<AdminFeedbackRow[]> {
  const { data, error } = await admin
    .from("feedback")
    .select(
      // The FK must be named explicitly: feedback references profiles twice
      // (user_id and resolved_by), so a bare profiles(username) is ambiguous
      // and PostgREST refuses it. Same fix as the notifications actor join.
      "id, type, message, route, status, admin_note, created_at, resolved_at, contact_email, role_at_submission, user_id, author:profiles!feedback_user_id_fkey(username)"
    )
    .order("created_at", { ascending: false });

  // 42P01 = addendum_027 hasn't been run yet. An empty tab is a better failure
  // than the whole admin panel throwing.
  if (error) {
    if (error.code !== "42P01") console.error("fetchAllFeedback failed:", error);
    return [];
  }

  type Row = {
    id: string;
    type: string;
    message: string;
    route: string | null;
    status: string;
    admin_note: string | null;
    created_at: string;
    resolved_at: string | null;
    contact_email: string | null;
    role_at_submission: string | null;
    user_id: string | null;
    author: { username: string } | null;
  };

  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    type: r.type,
    message: r.message,
    route: r.route,
    status: r.status,
    adminNote: r.admin_note,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
    contactEmail: r.contact_email,
    roleAtSubmission: r.role_at_submission,
    userId: r.user_id,
    username: r.author?.username ?? null,
  }));
}

// Just the number for the dashboard box. Counts what is still ACTIONABLE
// rather than everything ever sent - a total nobody can act on is decoration.
export async function fetchOpenFeedbackCount(admin: SupabaseClient): Promise<number> {
  const { count, error } = await admin
    .from("feedback")
    .select("id", { count: "exact", head: true })
    .in("status", ["new", "open"]);

  if (error) return 0;
  return count ?? 0;
}

export interface AdminUserDetail {
  id: string;
  email: string;
  username: string;
  role: string;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  /** Which sign-in methods are attached - "email", "google", or both. */
  providers: string[];
  onboardingComplete: boolean;
  /**
   * Age, not the date itself. The admin panel is the only place date_of_birth
   * is readable at all (addendum_018 took it off the public API), and the
   * reason it is collected is the 16+ gate - which age answers and a birthday
   * does not improve on.
   */
  age: number | null;
  artistName: string | null;
  artistBio: string | null;
  artistPhotoUrl: string | null;
  artistStatus: string | null;
  evidenceSubmitted: boolean;
  followerCount: number;
  socials: { label: string; value: string }[];
  stripeConnected: boolean;
  stripePayoutsReady: boolean;
  deletionRequestedAt: string | null;
  deletedAt: string | null;
  ticketsBought: number;
  ticketsAttended: number;
  totalSpentCents: number;
  showsCreated: number;
  followingCount: number;
  /** Events this person has liked/saved (#58). */
  likedCount: number;
  recentTickets: {
    id: string;
    eventTitle: string;
    eventDate: string;
    quantity: number;
    pricePaidCents: number;
    refunded: boolean;
    checkedIn: boolean;
    purchasedAt: string;
  }[];
}

function ageFrom(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const m = now.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age;
}

// Everything about one person, on one screen. Reads through the service-role
// client, so it sees the columns addendum_018 hid from everyone else.
export async function fetchUserDetail(
  admin: SupabaseClient,
  userId: string
): Promise<AdminUserDetail | null> {
  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (!profile) return null;

  const { data: authUser } = await admin.auth.admin.getUserById(userId);

  const [{ data: tickets }, { count: showsCreated }, { count: followingCount }, { count: likedCount }] =
    await Promise.all([
      admin
        .from("tickets")
        .select("id, quantity, price_paid, refunded, checked_in_at, purchased_at, events(title, event_date)")
        .eq("user_id", userId)
        .order("purchased_at", { ascending: false }),
      admin.from("events").select("id", { count: "exact", head: true }).eq("artist_id", userId),
      admin.from("follows").select("id", { count: "exact", head: true }).eq("follower_id", userId),
      admin.from("saved_events").select("event_id", { count: "exact", head: true }).eq("user_id", userId),
    ]);

  type Row = {
    id: string;
    quantity: number;
    price_paid: number;
    refunded: boolean;
    checked_in_at: string | null;
    purchased_at: string;
    events: { title: string; event_date: string } | null;
  };
  const rows = (tickets ?? []) as unknown as Row[];

  const socials = (
    [
      ["Instagram", profile.instagram],
      ["TikTok", profile.tiktok],
      ["Twitter / X", profile.twitter],
      ["Spotify", profile.spotify],
      ["YouTube", profile.youtube],
    ] as const
  )
    .filter(([, value]) => Boolean(value))
    .map(([label, value]) => ({ label, value: value as string }));

  return {
    id: userId,
    email: authUser?.user?.email ?? "",
    username: profile.username,
    role: profile.role,
    createdAt: profile.created_at,
    lastSignInAt: authUser?.user?.last_sign_in_at ?? null,
    emailConfirmedAt: authUser?.user?.email_confirmed_at ?? null,
    providers: authUser?.user?.identities?.map((i) => i.provider) ?? [],
    onboardingComplete: profile.onboarding_complete ?? true,
    age: ageFrom(profile.date_of_birth),
    artistName: profile.artist_name,
    artistBio: profile.artist_bio,
    artistPhotoUrl: profile.artist_photo_url,
    artistStatus: profile.artist_status,
    evidenceSubmitted: Boolean(profile.evidence_submitted),
    followerCount: profile.follower_count ?? 0,
    socials,
    stripeConnected: Boolean(profile.stripe_account_id),
    stripePayoutsReady: Boolean(profile.stripe_payouts_ready),
    deletionRequestedAt: profile.deletion_requested_at,
    deletedAt: profile.deleted_at,
    // Refunded tickets are excluded from the money and the counts, so the
    // numbers here match what /admin/billing reports rather than quietly
    // disagreeing with it.
    ticketsBought: rows.filter((r) => !r.refunded).reduce((n, r) => n + r.quantity, 0),
    ticketsAttended: rows.filter((r) => r.checked_in_at && !r.refunded).reduce((n, r) => n + r.quantity, 0),
    totalSpentCents: rows
      .filter((r) => !r.refunded)
      .reduce((n, r) => n + toCents(Number(r.price_paid)), 0),
    showsCreated: showsCreated ?? 0,
    followingCount: followingCount ?? 0,
    likedCount: likedCount ?? 0,
    recentTickets: rows.slice(0, 20).map((r) => ({
      id: r.id,
      eventTitle: r.events?.title ?? "Deleted event",
      eventDate: r.events?.event_date ?? "",
      quantity: r.quantity,
      pricePaidCents: toCents(Number(r.price_paid)),
      refunded: r.refunded,
      checkedIn: Boolean(r.checked_in_at),
      purchasedAt: r.purchased_at,
    })),
  };
}

// Artist ↔ existing-gig matching (#153). A gig imported/created before its
// artist signed up has artist_id null and isn't in event_artists, so the artist
// can't post to it. This suggests the links: an approved artist whose handle
// matches an untagged event's headliner (events.artist_name) or its lineup. The
// admin approves each (safer than auto-tagging by name, which could mis-attribute
// a gig to a same-named artist). Approving inserts the event_artists row, which
// is exactly what puts the show on their profile and lets them post.
export interface TagSuggestion {
  event: { id: string; title: string; date: string; venue: string };
  artist: { id: string; name: string };
  via: "headliner" | "lineup";
}

function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export async function fetchTagSuggestions(admin: SupabaseClient): Promise<TagSuggestion[]> {
  const [artistsRes, eventsRes, tagsRes] = await Promise.all([
    admin.from("profiles").select("id, username, artist_name").eq("artist_status", "approved"),
    admin
      .from("events")
      .select("id, title, artist_name, artist_id, event_date, venue, lineup")
      .eq("cancelled", false),
    admin.from("event_artists").select("event_id, profile_id"),
  ]);

  const tagged = new Set(
    (tagsRes.data ?? []).map((t) => `${t.event_id}:${t.profile_id}`)
  );

  // Both the display name and the username count as a handle a gig might be
  // billed under.
  const byHandle = new Map<string, { id: string; name: string }>();
  for (const a of artistsRes.data ?? []) {
    const id = a.id as string;
    const name = (a.artist_name as string | null) ?? (a.username as string);
    for (const handle of [a.artist_name as string | null, a.username as string | null]) {
      if (handle && handle.trim()) byHandle.set(normName(handle), { id, name });
    }
  }

  const out: TagSuggestion[] = [];
  for (const e of eventsRes.data ?? []) {
    const eventId = e.id as string;
    const ownerId = e.artist_id as string | null;
    const seen = new Set<string>();
    const consider = (artist: { id: string; name: string } | undefined, via: "headliner" | "lineup") => {
      if (!artist || artist.id === ownerId || seen.has(artist.id)) return;
      if (tagged.has(`${eventId}:${artist.id}`)) return;
      seen.add(artist.id);
      out.push({
        event: { id: eventId, title: e.title as string, date: e.event_date as string, venue: e.venue as string },
        artist,
        via,
      });
    };
    consider(byHandle.get(normName((e.artist_name as string) ?? "")), "headliner");
    for (const l of (e.lineup as string[] | null) ?? []) {
      if (l && l.trim()) consider(byHandle.get(normName(l)), "lineup");
    }
  }

  // Soonest shows first — the ones an artist most wants to post about.
  return out.sort((a, b) => a.event.date.localeCompare(b.event.date));
}
