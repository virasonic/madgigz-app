import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchProAccount, isProNotReady, ProAccount } from "@/lib/pro";
import { EventRow, mapEvent } from "@/lib/types";
import { getMessages, translate, type Locale } from "@/lib/i18n/config";

/**
 * Verifies the current session belongs to an active pro account. Every /pro
 * page and action calls this first - it throws rather than returning partial
 * data, exactly like requireAdmin, so a gap in the gate is a 500 and not a
 * silent leak.
 *
 * The lookup runs through the service-role client: the account row carries
 * `active`, and a deactivated pro must not be able to talk themselves back in.
 */
export interface ProSession {
  userId: string;
  account: ProAccount;
  locale: Locale;
  /**
   * Translator bound to the ACCOUNT's language, not the locale cookie. Server
   * components under /pro must use this rather than getServerT(), or a page's
   * server-rendered half would follow the browser while its client half follows
   * the account - the two ending up in different languages on one screen.
   */
  t: (key: string, vars?: Record<string, string | number>) => string;
}

export async function requirePro(): Promise<ProSession> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const account = await fetchProAccount(createAdminClient(), user.id);
  if (!account) throw new Error("Not authorized");
  if (!account.active) throw new Error("This pro account has been deactivated");

  const messages = getMessages(account.locale);
  return {
    userId: user.id,
    account,
    locale: account.locale,
    t: (key, vars) => translate(messages, key, vars),
  };
}

export function proClient(): SupabaseClient {
  return createAdminClient();
}

// ============================ Events ============================

/**
 * A show as the pro panel sees it: the event, plus whether this account
 * actually booked it, plus its takings - which are null when they did not.
 *
 * That null is the "venue sees the calendar, not other people's money" rule
 * (Vir's call): a venue account lists every show in its room so it can plan the
 * diary, but a show booked by a promoter or an artist shows no sales numbers.
 * Enforced here, in the query layer, rather than by the page choosing not to
 * render it - a number that must not be shown should not be fetched.
 */
export interface ProEventSummary {
  id: string;
  title: string;
  artist: string;
  venue: string;
  date: string;
  time: string;
  capacity: number;
  sold: number;
  active: boolean;
  cancelled: boolean;
  external: boolean;
  /** This pro account booked and is paid for the show. */
  owned: boolean;
  /**
   * Takings net of refunds, in euros. Null when `owned` is false - that null IS
   * the venue rule, not a missing value.
   */
  revenue: number | null;
}

const EVENT_COLUMNS =
  "id, artist_id, pro_account_id, venue_id, title, artist_name, venue, city, event_date, event_time, price, currency, accent_color, category, image_url, capacity, sold, description, lineup, doors, age_restriction, rating, ticketing_mode, ticketing_url, active, cancelled, max_per_order";

type ProEventRow = EventRow & { pro_account_id: string | null };

// Which shows this account may see at all. A promoter sees what it booked. A
// venue sees everything in its room, whoever booked it.
async function fetchScopedEventRows(
  admin: SupabaseClient,
  account: ProAccount
): Promise<ProEventRow[]> {
  const base = admin.from("events").select(EVENT_COLUMNS);

  const { data, error } =
    account.type === "venue" && account.venueId
      ? await base.or(`venue_id.eq.${account.venueId},pro_account_id.eq.${account.id}`)
      : await base.eq("pro_account_id", account.id);

  if (error) {
    // events.pro_account_id missing, i.e. addendum_051 hasn't run here yet.
    if (isProNotReady(error)) return [];
    console.error("fetchScopedEventRows failed:", error);
    return [];
  }
  return (data ?? []) as ProEventRow[];
}

interface TicketTotals {
  tickets: number;
  revenue: number;
}

// Takings per event, net of refunds. Only ever called with event ids this
// account owns, so there is no path by which a venue's totals pick up a show it
// merely hosts.
async function fetchTicketTotals(
  admin: SupabaseClient,
  eventIds: string[]
): Promise<Map<string, TicketTotals>> {
  const totals = new Map<string, TicketTotals>();
  if (eventIds.length === 0) return totals;

  const { data, error } = await admin
    .from("tickets")
    .select("event_id, quantity, price_paid, refunded")
    .in("event_id", eventIds)
    .eq("refunded", false);

  if (error) {
    console.error("fetchTicketTotals failed:", error);
    return totals;
  }

  for (const row of data ?? []) {
    const current = totals.get(row.event_id) ?? { tickets: 0, revenue: 0 };
    current.tickets += row.quantity;
    current.revenue += Number(row.price_paid);
    totals.set(row.event_id, current);
  }
  return totals;
}

export async function fetchProEvents(
  admin: SupabaseClient,
  account: ProAccount
): Promise<ProEventSummary[]> {
  const rows = await fetchScopedEventRows(admin, account);
  const ownedIds = rows.filter((r) => r.pro_account_id === account.id).map((r) => r.id);
  const totals = await fetchTicketTotals(admin, ownedIds);

  return rows
    .map((row) => {
      const event = mapEvent(row);
      const owned = row.pro_account_id === account.id;
      const total = totals.get(row.id);
      return {
        id: event.id,
        title: event.title,
        artist: event.artist,
        venue: event.venue,
        date: event.date,
        time: event.time,
        capacity: event.capacity,
        sold: event.sold,
        active: event.active,
        cancelled: event.cancelled,
        external: event.ticketing?.mode === "external",
        owned,
        revenue: owned ? (total?.revenue ?? 0) : null,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * One show, but only if this account is allowed to open it. Returns null rather
 * than throwing so the page can 404 - "you may not see this" and "it does not
 * exist" are deliberately the same answer to someone poking at ids.
 */
export async function fetchProEventForEdit(
  admin: SupabaseClient,
  account: ProAccount,
  eventId: string
) {
  const { data, error } = await admin
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("id", eventId)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as ProEventRow;
  // Editing is owner-only, always. A venue can *see* a promoter's show in its
  // room; it cannot rewrite its date or price.
  if (row.pro_account_id !== account.id) return null;
  return mapEvent(row);
}

// ============================ Admin listing ============================

export interface AdminProAccountRow {
  id: string;
  type: ProAccount["type"];
  displayName: string;
  email: string;
  venueName: string | null;
  active: boolean;
  payoutsReady: boolean;
  eventCount: number;
  createdAt: string;
}

/**
 * Every pro account, for the admin panel. Service-role only (the caller does
 * its own requireAdmin), and it joins the email out of auth.users, which is not
 * reachable from PostgREST at all.
 */
export async function fetchProAccountsAdmin(admin: SupabaseClient): Promise<AdminProAccountRow[]> {
  const { data, error } = await admin
    .from("pro_accounts")
    .select("id, type, display_name, venue_id, active, created_at, venues(name)")
    .order("created_at", { ascending: false });

  if (error) {
    // addendum_051 hasn't been run here yet - an empty list, not a crash.
    if (isProNotReady(error)) return [];
    console.error("fetchProAccountsAdmin failed:", error);
    return [];
  }

  // PostgREST types a nested select as an array even for a to-one relationship,
  // so the embed is read as one and unwrapped below rather than cast away.
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    type: ProAccount["type"];
    display_name: string;
    venue_id: string | null;
    active: boolean;
    created_at: string;
    venues?: { name: string } | { name: string }[] | null;
  }>;
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const [{ data: profiles }, { data: events }] = await Promise.all([
    admin.from("profiles").select("id, stripe_payouts_ready").in("id", ids),
    admin.from("events").select("pro_account_id").in("pro_account_id", ids),
  ]);

  const payouts = new Map((profiles ?? []).map((p) => [p.id, Boolean(p.stripe_payouts_ready)]));
  const eventCounts = new Map<string, number>();
  for (const e of events ?? []) {
    const key = e.pro_account_id as string;
    eventCounts.set(key, (eventCounts.get(key) ?? 0) + 1);
  }

  // Emails live in auth.users, so they come from the Admin API rather than a
  // join. One call for the whole page beats one per row.
  const emails = new Map<string, string>();
  for (const id of ids) {
    const { data: authUser } = await admin.auth.admin.getUserById(id);
    if (authUser?.user?.email) emails.set(id, authUser.user.email);
  }

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    displayName: row.display_name,
    email: emails.get(row.id) ?? "—",
    venueName: (Array.isArray(row.venues) ? row.venues[0]?.name : row.venues?.name) ?? null,
    active: row.active,
    payoutsReady: payouts.get(row.id) ?? false,
    eventCount: eventCounts.get(row.id) ?? 0,
    createdAt: row.created_at,
  }));
}

// ============================ Dashboard ============================

export interface ProDashboardStats {
  /** Shows this account booked, whatever their state. */
  eventCount: number;
  /** Booked shows still to happen and not cancelled. */
  upcomingCount: number;
  ticketsSold: number;
  revenue: number;
  revenueToday: number;
  ticketsToday: number;
  /** Newest day first: [YYYY-MM-DD, tickets, euros]. Last 14 days with sales. */
  salesByDay: Array<[string, number, number]>;
  /** Shows in the room this account did not book. Venue accounts only. */
  hostedCount: number;
}

export async function fetchProDashboardStats(
  admin: SupabaseClient,
  account: ProAccount
): Promise<ProDashboardStats> {
  const rows = await fetchScopedEventRows(admin, account);
  const owned = rows.filter((r) => r.pro_account_id === account.id);
  const ownedIds = owned.map((r) => r.id);

  const today = new Date().toISOString().slice(0, 10);
  const upcomingCount = owned.filter((r) => r.event_date >= today && !r.cancelled).length;

  if (ownedIds.length === 0) {
    return {
      eventCount: 0,
      upcomingCount: 0,
      ticketsSold: 0,
      revenue: 0,
      revenueToday: 0,
      ticketsToday: 0,
      salesByDay: [],
      hostedCount: rows.length,
    };
  }

  const { data: tickets, error } = await admin
    .from("tickets")
    .select("quantity, price_paid, purchased_at, refunded")
    .in("event_id", ownedIds)
    .eq("refunded", false);

  if (error) console.error("fetchProDashboardStats tickets failed:", error);

  let ticketsSold = 0;
  let revenue = 0;
  const byDay = new Map<string, TicketTotals>();

  for (const t of tickets ?? []) {
    ticketsSold += t.quantity;
    revenue += Number(t.price_paid);
    // Bucketed by the local calendar day, because "today's sales" is a question
    // about the promoter's day, not about UTC.
    const day = new Date(t.purchased_at).toLocaleDateString("en-CA");
    const current = byDay.get(day) ?? { tickets: 0, revenue: 0 };
    current.tickets += t.quantity;
    current.revenue += Number(t.price_paid);
    byDay.set(day, current);
  }

  const localToday = new Date().toLocaleDateString("en-CA");
  const todayTotals = byDay.get(localToday) ?? { tickets: 0, revenue: 0 };

  return {
    eventCount: owned.length,
    upcomingCount,
    ticketsSold,
    revenue,
    revenueToday: todayTotals.revenue,
    ticketsToday: todayTotals.tickets,
    salesByDay: Array.from(byDay.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 14)
      .map(([day, totals]) => [day, totals.tickets, totals.revenue] as [string, number, number]),
    hostedCount: rows.length - owned.length,
  };
}
