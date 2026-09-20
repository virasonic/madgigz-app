import type { SupabaseClient } from "@supabase/supabase-js";

export type ProAccountType = "promoter" | "venue";

export interface ProAccount {
  /** Same id as the profile and the auth user - a pro account IS a profile. */
  id: string;
  type: ProAccountType;
  displayName: string;
  /** Venue accounts only: the room they manage. Always null for a promoter. */
  venueId: string | null;
  active: boolean;
}

export interface ProAccountRow {
  id: string;
  type: ProAccountType;
  display_name: string;
  venue_id: string | null;
  active: boolean;
}

export function mapProAccount(row: ProAccountRow): ProAccount {
  return {
    id: row.id,
    type: row.type,
    displayName: row.display_name,
    venueId: row.venue_id,
    active: row.active,
  };
}

// What the app sees before addendum_051 has been run by hand. PostgREST reports
// a missing relation differently depending on read vs write, and differently
// again while its schema cache is still warming just after the SQL lands:
//   42P01    - Postgres "relation does not exist"
//   42703    - Postgres "column does not exist" (surfaces on SELECT)
//   PGRST205 - table not found in the schema cache
//   PGRST204 - column not found in the schema cache (surfaces on write)
//   42501    - the grant was missed, which reads as an empty field not an error
// All of them mean "the pro feature isn't installed here", which is not worth
// throwing over: the panel is simply unreachable until the SQL runs. Same set
// and same reasoning as fiscal-server.ts.
const MISSING_CODES = new Set(["42P01", "42703", "42501", "PGRST204", "PGRST205"]);

/** True when an error means "addendum_051 isn't in this database yet". */
export function isProNotReady(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code && MISSING_CODES.has(error.code)) return true;
  // Some PostgREST versions omit the code and only set the message.
  return /schema cache|does not exist/i.test(error.message ?? "");
}

/**
 * The pro account for a given profile, or null. Safe to call for anyone: a fan
 * has no row, which is a null rather than a failure.
 *
 * `client` may be either the caller's own Supabase client (the self-select
 * policy in addendum_051 lets a pro user read their own row, which is how the
 * app shell decides whether to show the panel link) or the service-role client
 * (how the panel itself reads, for anybody).
 */
export async function fetchProAccount(
  client: SupabaseClient,
  profileId: string
): Promise<ProAccount | null> {
  if (!profileId) return null;

  const { data, error } = await client
    .from("pro_accounts")
    .select("id, type, display_name, venue_id, active")
    .eq("id", profileId)
    .maybeSingle();

  if (error) {
    if (isProNotReady(error)) return null;
    console.error("fetchProAccount failed:", error);
    return null;
  }

  return data ? mapProAccount(data as ProAccountRow) : null;
}

export function proTypeLabel(type: ProAccountType): string {
  return type === "venue" ? "Venue" : "Promoter";
}
