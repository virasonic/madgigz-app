// Server-only: every function here expects the service-role client. Never
// import this from a "use client" module.
import type { SupabaseClient } from "@supabase/supabase-js";
import { ARTIST_EVIDENCE_BUCKET } from "@/lib/supabase/storage";

// How long an account sits in limbo before it is actually scrubbed. Signing in
// during this window cancels the request - accidental and regretted deletions
// are common, and without a grace period the only remedy is rebuilding the
// account by hand from a support email.
export const GRACE_PERIOD_DAYS = 30;

// Why the tombstone exists, in one place, so the reasoning travels with the
// code: tickets are AuraSonic's sales records and Spanish commercial books run
// to six years, which GDPR art. 17(3)(b) explicitly defers to.
export const RETENTION_YEARS = 6;

export interface DeletionBlocker {
  reason: string;
  detail: string;
}

const TODAY = () => new Date().toISOString().slice(0, 10);

// A deletion that strands other people is not the account holder's to make.
// Both checks look forward only: a gig that has already happened can't be
// spoiled by the account going away.
export async function findDeletionBlockers(
  admin: SupabaseClient,
  profileId: string
): Promise<DeletionBlocker[]> {
  const blockers: DeletionBlocker[] = [];
  const today = TODAY();

  // 1. They hold a ticket to something upcoming. Deleting kills the QR, so the
  //    account would vanish and take their entry with it. We don't auto-refund
  //    instead: that would be MadGigz cancelling someone's night out because
  //    they tapped a settings button.
  const { data: heldTickets } = await admin
    .from("tickets")
    .select("event_id, refunded, events!inner(title, event_date, cancelled)")
    .eq("user_id", profileId)
    .eq("refunded", false)
    .gte("events.event_date", today)
    .eq("events.cancelled", false);

  const upcoming = (heldTickets ?? []) as unknown as {
    events: { title: string; event_date: string };
  }[];
  if (upcoming.length > 0) {
    const next = upcoming.sort((a, b) =>
      a.events.event_date.localeCompare(b.events.event_date)
    )[0];
    blockers.push({
      reason: "You have tickets to an upcoming show",
      detail: `${next.events.title} on ${next.events.event_date}. You can delete your account once it has happened, or ask us for a refund first.`,
    });
  }

  // 2. They are an artist with an upcoming show that people have paid for.
  //    Their account going away can't be allowed to cancel a hundred people's
  //    evening as a side effect.
  const { data: soldShows } = await admin
    .from("events")
    .select("title, event_date, sold")
    .eq("artist_id", profileId)
    .eq("cancelled", false)
    .gte("event_date", today)
    .gt("sold", 0);

  if ((soldShows ?? []).length > 0) {
    const next = (soldShows ?? []).sort((a, b) =>
      String(a.event_date).localeCompare(String(b.event_date))
    )[0];
    blockers.push({
      reason: "You have upcoming shows with tickets sold",
      detail: `${next.title} on ${next.event_date} has ${next.sold} sold. Cancel it from Manage Show (which refunds everyone) or wait until it has happened.`,
    });
  }

  return blockers;
}

function tombstoneUsername(profileId: string) {
  // Has to satisfy the case-insensitive unique index from addendum_011, so it
  // carries a slice of the id rather than being a fixed string.
  return `deleted-${profileId.slice(0, 8)}`;
}

// The scrub itself. Everything personal goes; the row stays.
//
// Deliberately NOT auth.admin.deleteUser(): profiles cascades from auth.users
// and tickets cascades from profiles, so deleting the auth user would take the
// person's entire purchase history with it - the exact records that have to be
// kept. The auth user is neutered instead: a placeholder email, a random
// password, and a ban, which is indistinguishable from deletion to the person
// holding the old credentials.
export async function purgeAccount(
  admin: SupabaseClient,
  profileId: string
): Promise<{ ok: boolean; error?: string }> {
  const { data: profile } = await admin
    .from("profiles")
    .select("id, artist_photo_url, deleted_at")
    .eq("id", profileId)
    .maybeSingle();

  if (!profile) return { ok: false, error: "No such profile" };
  if (profile.deleted_at) return { ok: true }; // already a tombstone, nothing to redo

  // Their own uploads. Posts go entirely - they're the person's photos and
  // videos, not a business record.
  const { data: posts } = await admin
    .from("content_posts")
    .select("id, media_url")
    .eq("artist_id", profileId);

  const publicPrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/event-media/`;
  const mediaPaths = [
    ...(posts ?? []).map((p) => p.media_url as string),
    profile.artist_photo_url as string | null,
  ]
    // Picsum seed URLs and anything else not in our bucket fall out here -
    // only objects we actually uploaded should ever be removed.
    .filter((url): url is string => typeof url === "string" && url.startsWith(publicPrefix))
    .map((url) => url.slice(publicPrefix.length));

  if (mediaPaths.length > 0) {
    await admin.storage.from("event-media").remove(mediaPaths);
  }

  // Verification evidence: the private bucket, plus the row that points at it.
  const { data: evidence } = await admin
    .from("artist_evidence")
    .select("storage_path")
    .eq("profile_id", profileId);
  const evidencePaths = (evidence ?? []).map((e) => e.storage_path as string).filter(Boolean);
  if (evidencePaths.length > 0) {
    await admin.storage.from(ARTIST_EVIDENCE_BUCKET).remove(evidencePaths);
  }
  await admin.from("artist_evidence").delete().eq("profile_id", profileId);

  await admin.from("content_posts").delete().eq("artist_id", profileId);
  await admin.from("saved_events").delete().eq("user_id", profileId);
  await admin.from("event_artists").delete().eq("profile_id", profileId);

  // Upcoming shows are hidden rather than deleted. Any with tickets sold can't
  // have reached this point (findDeletionBlockers stops them), so nothing here
  // is a gig somebody is expecting. Past shows stay visible: a performance that
  // happened is a matter of record, and their tickets point at it.
  await admin
    .from("events")
    .update({ active: false })
    .eq("artist_id", profileId)
    .gte("event_date", TODAY());

  const { error: scrubError } = await admin
    .from("profiles")
    .update({
      username: tombstoneUsername(profileId),
      artist_name: null,
      artist_bio: null,
      artist_photo_url: null,
      date_of_birth: null,
      instagram: null,
      tiktok: null,
      twitter: null,
      spotify: null,
      youtube: null,
      evidence_submitted: false,
      artist_status: null,
      deleted_at: new Date().toISOString(),
      deletion_requested_at: null,
    })
    .eq("id", profileId);

  if (scrubError) return { ok: false, error: scrubError.message };

  // stripe_account_id is deliberately left alone. It identifies a business
  // account rather than a person, the payout reconciliation needs it, and
  // nulling it would strand any balance Stripe is still holding. It is
  // service-role-only since addendum_018, so it is not exposed by keeping it.
  const { error: authError } = await admin.auth.admin.updateUserById(profileId, {
    email: `deleted-${profileId}@deleted.madgigz.invalid`,
    password: crypto.randomUUID() + crypto.randomUUID(),
    ban_duration: "876000h", // 100 years; Supabase has no "forever"
    user_metadata: {},
  });

  if (authError) return { ok: false, error: authError.message };
  return { ok: true };
}

// Everything whose grace period has run out. Called by the daily cron and by
// the admin panel's manual runner.
export async function purgeDueAccounts(admin: SupabaseClient) {
  const cutoff = new Date(Date.now() - GRACE_PERIOD_DAYS * 86_400_000).toISOString();

  const { data: due } = await admin
    .from("profiles")
    .select("id")
    .not("deletion_requested_at", "is", null)
    .is("deleted_at", null)
    .lte("deletion_requested_at", cutoff);

  const results = { purged: 0, failed: [] as string[] };
  for (const row of due ?? []) {
    const result = await purgeAccount(admin, row.id as string);
    if (result.ok) results.purged += 1;
    else results.failed.push(`${row.id}: ${result.error}`);
  }
  return results;
}
