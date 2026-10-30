// Door-staff scan links (#218). Server-only: everything here runs with the
// service-role client, and the token minting uses node:crypto. Never import
// from a Client Component.
//
// A door link is a bearer capability for ONE show: whoever opens
// /door/<token> can look up and check in that show's tickets, and nothing else.
// The organiser mints it from the show, sends it to the door person over
// WhatsApp, and can revoke it; it expires on its own the day after the show.
// Only sha256(token) is stored, so a read of door_links cannot be turned into
// a working link.
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EventRow, mapEvent, type EventItem } from "@/lib/types";

// How long after the show's date a link keeps working. Measured from midnight
// UTC at the START of the show's date, so 36h covers a show that opens at 22:00
// and a door that runs until 4am the next morning, and then dies before the
// following evening. A leaked link is bounded by this even if nobody revokes it.
export const DOOR_LINK_TTL_HOURS = 36;

/** When a link for a show on `date` (YYYY-MM-DD) stops working. */
export function doorLinkExpiry(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + DOOR_LINK_TTL_HOURS * 60 * 60 * 1000);
}

/** sha256 hex of the token: what the table stores and what lookups match on. */
export function hashDoorToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// 24 random bytes → 32 base64url chars: unguessable, and URL-safe without
// encoding, so a WhatsApped link survives copy-paste intact.
export function mintDoorToken(): string {
  return randomBytes(24).toString("base64url");
}

// Door tokens are base64url, 32 chars; anything else is refused before the
// database is asked, so a scanner can't be used to probe the table with junk.
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32}$/;
export function isDoorTokenShaped(token: string): boolean {
  return TOKEN_SHAPE.test(token);
}

// What the app sees before addendum_063 has been run by hand. Same set and
// reasoning as isProNotReady in pro.ts: all of these mean "the table isn't
// here yet", which the feature hides rather than throws over.
const MISSING_CODES = new Set(["42P01", "42703", "42501", "PGRST204", "PGRST205"]);
export function isDoorLinksNotReady(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code && MISSING_CODES.has(error.code)) return true;
  return /schema cache|does not exist/i.test(error.message ?? "");
}

export type DoorLinkState = "active" | "expired" | "revoked";

/** A link as the organiser's list shows it. Never carries the token. */
export interface DoorLinkSummary {
  id: string;
  label: string;
  createdAt: string;
  expiresAt: string;
  state: DoorLinkState;
  scanCount: number;
  lastUsedAt: string | null;
}

interface DoorLinkRow {
  id: string;
  event_id: string;
  label: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
  scan_count: number;
}

const LINK_COLUMNS = "id, event_id, label, created_at, expires_at, revoked_at, last_used_at, scan_count";

function linkState(row: DoorLinkRow, now = Date.now()): DoorLinkState {
  if (row.revoked_at) return "revoked";
  if (new Date(row.expires_at).getTime() <= now) return "expired";
  return "active";
}

function toSummary(row: DoorLinkRow): DoorLinkSummary {
  return {
    id: row.id,
    label: row.label,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    state: linkState(row),
    scanCount: row.scan_count,
    lastUsedAt: row.last_used_at,
  };
}

/**
 * May this signed-in user mint door links for this show? The same rule the
 * ticket RLS applies to scanning (addenda 026, 046, 052): the owner artist; a
 * pro account for a show it booked; an admin for an OWNERLESS (MadGigz house)
 * show. Not an admin for an artist's own show - that stays the artist's, exactly
 * as in show-actions' canManageEvent.
 */
export async function canScanEvent(
  admin: SupabaseClient,
  userId: string,
  event: { artist_id: string | null; pro_account_id: string | null }
): Promise<boolean> {
  if (event.artist_id === userId) return true;
  if (event.pro_account_id === userId) {
    const { data } = await admin
      .from("pro_accounts")
      .select("active")
      .eq("id", userId)
      .maybeSingle();
    if (data?.active) return true;
  }
  if (event.artist_id === null) {
    const { data } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
    return data?.role === "admin";
  }
  return false;
}

export type MintResult =
  | { ok: true; token: string; link: DoorLinkSummary }
  | { ok: false; error: "notReady" | "db" };

/** Creates a link for a show. The plain token is returned ONCE, never stored. */
export async function insertDoorLink(
  admin: SupabaseClient,
  input: { eventId: string; eventDate: string; label: string; createdBy: string }
): Promise<MintResult> {
  const token = mintDoorToken();
  const { data, error } = await admin
    .from("door_links")
    .insert({
      event_id: input.eventId,
      token_hash: hashDoorToken(token),
      label: input.label.trim().slice(0, 60),
      created_by: input.createdBy,
      expires_at: doorLinkExpiry(input.eventDate).toISOString(),
    })
    .select(LINK_COLUMNS)
    .single();
  if (error || !data) {
    return { ok: false, error: isDoorLinksNotReady(error) ? "notReady" : "db" };
  }
  return { ok: true, token, link: toSummary(data as DoorLinkRow) };
}

export async function fetchDoorLinks(
  admin: SupabaseClient,
  eventId: string
): Promise<{ links: DoorLinkSummary[]; notReady: boolean }> {
  const { data, error } = await admin
    .from("door_links")
    .select(LINK_COLUMNS)
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });
  if (error) return { links: [], notReady: isDoorLinksNotReady(error) };
  return { links: ((data ?? []) as DoorLinkRow[]).map(toSummary), notReady: false };
}

export type VerifiedDoorLink =
  | { ok: true; linkId: string; scanCount: number; event: EventItem }
  | { ok: false; reason: "invalid" | "expired" | "revoked" | "notReady" };

/**
 * Resolves a token to its show, or says why not. "invalid" covers an unknown
 * and a malformed token alike - a scanner probing the table learns nothing from
 * the difference. The event comes back mapped so the door page can show the
 * title/venue/date without a second trip.
 */
export async function verifyDoorToken(admin: SupabaseClient, token: string): Promise<VerifiedDoorLink> {
  if (!isDoorTokenShaped(token)) return { ok: false, reason: "invalid" };
  const { data, error } = await admin
    .from("door_links")
    .select(LINK_COLUMNS)
    .eq("token_hash", hashDoorToken(token))
    .maybeSingle();
  if (error) return { ok: false, reason: isDoorLinksNotReady(error) ? "notReady" : "invalid" };
  if (!data) return { ok: false, reason: "invalid" };
  const row = data as DoorLinkRow;
  const state = linkState(row);
  if (state !== "active") return { ok: false, reason: state };

  const { data: eventRow } = await admin.from("events").select("*").eq("id", row.event_id).maybeSingle();
  if (!eventRow) return { ok: false, reason: "invalid" };
  return { ok: true, linkId: row.id, scanCount: row.scan_count, event: mapEvent(eventRow as EventRow) };
}

/** Marks a scan on the link. Best-effort: a lost increment never blocks the door. */
export async function touchDoorLink(admin: SupabaseClient, linkId: string, scanCount: number): Promise<void> {
  await admin
    .from("door_links")
    .update({ last_used_at: new Date().toISOString(), scan_count: scanCount + 1 })
    .eq("id", linkId);
}
