import type { SupabaseClient } from "@supabase/supabase-js";
import { anonymiseUserId, type CsvCell, type DateRange } from "@/lib/analytics-export";
import { listAllAuthUsers } from "@/lib/supabase/admin-queries";

// The four analyst exports (#228). Each returns a header + rows for toCsv().
// Service-role reads only (the route handler has already passed requireAdmin),
// and NOTHING here selects a name, email, phone, Stripe id or raw user id into
// the output: user ids leave only as the keyed pseudonym from
// anonymiseUserId(), and the tickets export carries no user column at all.

export interface ExportTable {
  header: string[];
  rows: CsvCell[][];
}

// A refusal the route turns into a plain-text response. Thrown for "the DB is
// missing the table" and "the pseudonym key isn't configured" so the analyst
// reads why instead of getting an empty file that looks like zero activity.
export class ExportError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

// Applies the inclusive date range to whichever timestamp column the dataset
// is keyed on.
function inRange<T extends { gte: (c: string, v: string) => T; lt: (c: string, v: string) => T }>(
  query: T,
  column: string,
  range: DateRange
): T {
  let q = query;
  if (range.fromIso) q = q.gte(column, range.fromIso);
  if (range.toIsoExclusive) q = q.lt(column, range.toIsoExclusive);
  return q;
}

function euros(cents: number | null | undefined): number {
  return Number(cents ?? 0) / 100;
}

// ----------------------------------------------------------------------------
// Shows — keyed on events.created_at (when it was LISTED, not when it happens).
// ----------------------------------------------------------------------------

export async function exportShows(admin: SupabaseClient, range: DateRange): Promise<ExportTable> {
  type Row = {
    id: string;
    created_at: string;
    event_date: string;
    venue: string;
    city: string;
    ticketing_mode: "internal" | "external";
    artist_id: string | null;
    // Absent on a database where addendum_051 hasn't run.
    pro_account_id?: string | null;
    house_run?: boolean | null;
    cancelled?: boolean | null;
    price: number;
  };

  const { data, error } = await inRange(admin.from("events").select("*"), "created_at", range).order(
    "created_at",
    { ascending: true }
  );
  if (error) throw new ExportError(500, `events: ${error.message}`);

  const header = [
    "show_id",
    "created_at",
    "show_date",
    "venue",
    "city",
    "is_ticketed",
    "created_by_artist",
    "created_by",
    "is_free",
    "cancelled",
  ];
  const rows = ((data as Row[]) ?? []).map((e) => {
    // Who listed it. Admin-created and imported shows always have artist_id
    // null (event-actions.ts, gig-import.ts) and artist-posted ones always set
    // it; a promoter/venue show carries pro_account_id instead. Spelled out as
    // a third column so a promoter's show isn't silently counted as ours.
    const createdBy = e.artist_id ? "artist" : e.pro_account_id ? "pro" : "madgigz";
    return [
      e.id,
      e.created_at,
      e.event_date,
      e.venue,
      e.city,
      // "Ticketed" = MadGigz sells the ticket. An external-link show is listed
      // for discovery but the sale happens elsewhere.
      e.ticketing_mode === "internal",
      createdBy === "artist",
      createdBy,
      Number(e.price) === 0,
      Boolean(e.cancelled),
    ];
  });
  return { header, rows };
}

// ----------------------------------------------------------------------------
// Tickets — keyed on tickets.purchased_at. One row per ticket row (since
// addendum_036 each seat is its own row with quantity 1; older rows may carry
// quantity > 1 with price_paid as the row total). No user column, on purpose.
// ----------------------------------------------------------------------------

export async function exportTickets(admin: SupabaseClient, range: DateRange): Promise<ExportTable> {
  type Row = {
    event_id: string;
    purchased_at: string;
    quantity: number;
    price_paid: number;
    application_fee_cents: number | null;
    application_fee_vat_cents: number | null;
    refunded: boolean;
    fee_retained?: boolean | null;
    discount_id: string | null;
  };

  const { data, error } = await inRange(admin.from("tickets").select("*"), "purchased_at", range).order(
    "purchased_at",
    { ascending: true }
  );
  if (error) throw new ExportError(500, `tickets: ${error.message}`);

  const header = [
    "show_id",
    "purchase_date",
    "quantity",
    "ticket_price",
    "madgigz_fee",
    "madgigz_fee_vat",
    "refunded",
    "fee_retained",
    "discount_applied",
  ];
  const rows = ((data as Row[]) ?? []).map((t) => [
    t.event_id,
    t.purchased_at,
    t.quantity,
    Number(t.price_paid),
    // Commission ex-VAT and the IVA on it, kept apart (CLAUDE.md: never
    // conflate revenue with VAT owed). Both are the amounts charged at purchase;
    // on a refund the fee was reversed too unless fee_retained is true.
    euros(t.application_fee_cents),
    euros(t.application_fee_vat_cents),
    t.refunded,
    Boolean(t.fee_retained),
    t.discount_id !== null,
  ]);
  return { header, rows };
}

// ----------------------------------------------------------------------------
// Users — keyed on profiles.created_at (signup). Pseudonymous.
// ----------------------------------------------------------------------------

export async function exportUsers(
  admin: SupabaseClient,
  range: DateRange,
  secret: string
): Promise<ExportTable> {
  type ProfileRow = {
    id: string;
    role: string;
    created_at: string;
    deleted_at: string | null;
    pro_type?: string | null;
  };
  type AttributionRow = { user_id: string; source: string | null; medium: string | null; campaign: string | null };
  type TicketRow = { user_id: string; event_id: string };
  type EventRow = { id: string; city: string };

  const [{ data: profiles, error }, authUsers, { data: attribution }, { data: tickets }, { data: events }] =
    await Promise.all([
      inRange(
        admin.from("profiles").select("id, role, created_at, deleted_at, pro_type"),
        "created_at",
        range
      ).order("created_at", { ascending: true }),
      listAllAuthUsers(admin),
      // service-role only table; missing pre-addendum_050 → treated as "no data".
      admin.from("signup_attribution").select("user_id, source, medium, campaign"),
      admin.from("tickets").select("user_id, event_id"),
      admin.from("events").select("id, city"),
    ]);
  if (error) throw new ExportError(500, `profiles: ${error.message}`);

  const lastSignIn = new Map(authUsers.map((u) => [u.id, u.last_sign_in_at ?? null]));
  const attributionByUser = new Map(
    ((attribution as AttributionRow[] | null) ?? []).map((a) => [a.user_id, a])
  );

  // "City" is not something a user tells us. The nearest honest signal is where
  // they buy tickets: the most frequent city among the shows they bought into,
  // blank for a user with no tickets. Named derived_city so the analyst doesn't
  // read it as a home address.
  const cityByEvent = new Map(((events as EventRow[] | null) ?? []).map((e) => [e.id, e.city]));
  const cityCounts = new Map<string, Map<string, number>>();
  for (const t of (tickets as TicketRow[] | null) ?? []) {
    const city = cityByEvent.get(t.event_id);
    if (!city) continue;
    const counts = cityCounts.get(t.user_id) ?? new Map<string, number>();
    counts.set(city, (counts.get(city) ?? 0) + 1);
    cityCounts.set(t.user_id, counts);
  }
  const topCity = (userId: string): string | null => {
    const counts = cityCounts.get(userId);
    if (!counts) return null;
    let best: string | null = null;
    let bestN = 0;
    for (const [city, n] of counts) {
      if (n > bestN) {
        best = city;
        bestN = n;
      }
    }
    return best;
  };

  const header = [
    "anonymous_user_id",
    "signup_date",
    "role",
    "pro_type",
    "derived_city",
    "platform",
    "last_sign_in_date",
    "signup_source",
    "signup_medium",
    "signup_campaign",
  ];
  const rows = ((profiles as ProfileRow[]) ?? [])
    // Tombstones of purged accounts are not users, and admin and analyst
    // accounts are staff — a handful of rows that a signup date alone would
    // identify (the analyst would be reading their own row).
    .filter((p) => !p.deleted_at && p.role !== "admin" && p.role !== "analyst")
    .map((p) => {
      const a = attributionByUser.get(p.id);
      const seen = lastSignIn.get(p.id);
      return [
        anonymiseUserId(p.id, secret),
        // Day precision only: an exact signup second next to a public profile
        // would make the pseudonym trivially re-identifiable.
        p.created_at.slice(0, 10),
        p.role,
        p.pro_type ?? null,
        topCity(p.id),
        // Not tracked yet: the app never records whether a session is the iOS
        // or Android shell or the web. Column kept so the file's shape is
        // stable when it lands.
        null,
        // auth.users.last_sign_in_at moves on a fresh login, NOT on day-to-day
        // use of a session that stays logged in, so this under-reports activity
        // and is named for what it is rather than "last active".
        seen ? seen.slice(0, 10) : null,
        a?.source ?? null,
        a?.medium ?? null,
        a?.campaign ?? null,
      ];
    });
  return { header, rows };
}

// ----------------------------------------------------------------------------
// Poster-wall exports — keyed on poster_wall_exports.created_at. Pseudonymous.
// ----------------------------------------------------------------------------

export async function exportPosterWallExports(
  admin: SupabaseClient,
  range: DateRange,
  secret: string
): Promise<ExportTable> {
  type Row = { user_id: string; created_at: string; show_count: number };

  const { data, error } = await inRange(
    admin.from("poster_wall_exports").select("user_id, created_at, show_count"),
    "created_at",
    range
  ).order("created_at", { ascending: true });
  if (error) {
    // Postgres says 42P01 for a missing table; PostgREST answers PGRST205 when
    // the table isn't in its schema cache (which is what staging actually
    // returned in the browser probe), so treat both as "not migrated yet".
    if (error.code === "42P01" || error.code === "PGRST205") {
      throw new ExportError(
        503,
        "poster_wall_exports is not in this database yet: run supabase/addendum_064_poster_wall_exports.sql first."
      );
    }
    throw new ExportError(500, `poster_wall_exports: ${error.message}`);
  }

  const header = ["anonymous_user_id", "timestamp", "number_of_shows_on_wall"];
  const rows = ((data as Row[]) ?? []).map((r) => [
    anonymiseUserId(r.user_id, secret),
    r.created_at,
    r.show_count,
  ]);
  return { header, rows };
}
