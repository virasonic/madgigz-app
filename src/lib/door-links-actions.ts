"use server";

// The organiser's side of door links (#218): mint, list, revoke - for a show
// the caller is allowed to scan. Shared by the three places a show is managed
// (the artist's manage sheet, /pro, /admin), so the ownership rule lives in one
// spot (canScanEvent) rather than three.
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  canScanEvent,
  fetchDoorLinks,
  insertDoorLink,
  isDoorLinksNotReady,
  type DoorLinkSummary,
} from "@/lib/door-links";

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

interface ScannableEvent {
  id: string;
  artist_id: string | null;
  pro_account_id: string | null;
  date: string;
  cancelled: boolean;
}

// Who is asking, and may they run this show's door? Null = no. The event is
// read through the service-role client because an ownerless house show isn't
// readable as "mine" by anyone - the rule itself decides, not RLS.
async function authorise(eventId: string): Promise<{ userId: string; event: ScannableEvent } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("events")
    .select("id, artist_id, pro_account_id, event_date, cancelled")
    .eq("id", eventId)
    .maybeSingle();
  if (!data) return null;
  // The column is event_date; ScannableEvent carries it as `date` like EventItem.
  const { event_date, ...rest } = data as Omit<ScannableEvent, "date"> & { event_date: string };
  const event: ScannableEvent = { ...rest, date: event_date };
  if (!(await canScanEvent(admin, user.id, event))) return null;
  return { userId: user.id, event };
}

export type CreateDoorLinkResult =
  | { ok: true; url: string; link: DoorLinkSummary }
  | { ok: false; error: string };

export async function createDoorLink(eventId: string, label: string): Promise<CreateDoorLinkResult> {
  const auth = await authorise(eventId);
  if (!auth) return { ok: false, error: "Not your show" };
  if (auth.event.cancelled) return { ok: false, error: "This show is cancelled" };

  const minted = await insertDoorLink(createAdminClient(), {
    eventId,
    eventDate: auth.event.date,
    label,
    createdBy: auth.userId,
  });
  if (!minted.ok) {
    return {
      ok: false,
      error: minted.error === "notReady" ? "Door links aren't available yet" : "Could not create the link",
    };
  }
  return { ok: true, url: `${appUrl()}/door/${minted.token}`, link: minted.link };
}

export async function listDoorLinks(
  eventId: string
): Promise<{ links: DoorLinkSummary[]; notReady: boolean; error: string | null }> {
  const auth = await authorise(eventId);
  if (!auth) return { links: [], notReady: false, error: "Not your show" };
  const result = await fetchDoorLinks(createAdminClient(), eventId);
  return { ...result, error: null };
}

export async function revokeDoorLink(linkId: string): Promise<{ error: string | null }> {
  const admin = createAdminClient();
  const { data: link, error: readError } = await admin
    .from("door_links")
    .select("id, event_id")
    .eq("id", linkId)
    .maybeSingle();
  if (readError) {
    return { error: isDoorLinksNotReady(readError) ? "Door links aren't available yet" : "Could not revoke" };
  }
  if (!link) return { error: "Link not found" };
  // Ownership is of the SHOW, not the link row: a co-organiser may revoke a
  // link someone else on the same show created.
  const auth = await authorise(link.event_id as string);
  if (!auth) return { error: "Not your show" };

  const { error } = await admin
    .from("door_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", linkId)
    .is("revoked_at", null);
  return { error: error ? "Could not revoke" : null };
}
