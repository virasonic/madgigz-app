import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { purgeDueAccounts } from "@/lib/account-deletion";
import type { SupabaseClient } from "@supabase/supabase-js";

// The nightly maintenance job. Two things live here: purging accounts whose
// 30-day grace has run out, and reminding people about gigs happening tomorrow.
//
// Both in one route on purpose - Vercel's cron allowance is small, and a second
// scheduled endpoint would double the config for work that takes milliseconds.
// The path still says purge-accounts because that is what Vercel and CRON_SECRET
// are already pointed at, and renaming it would mean reconfiguring both.
//
// Vercel Cron sends Authorization: Bearer $CRON_SECRET, which is the only thing
// standing between this endpoint and the open internet.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;

  // Never throw at module scope on a missing variable - that takes the whole
  // build down. Fail the request instead, loudly enough to find in the logs.
  if (!secret) {
    console.error("purge-accounts: CRON_SECRET is not set; refusing to run");
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const results = await purgeDueAccounts(admin);
  if (results.failed.length > 0) {
    console.error("purge-accounts: some accounts failed", results.failed);
  }

  const reminded = await notifyUpcomingEvents(admin);

  return NextResponse.json({
    purged: results.purged,
    failed: results.failed.length,
    reminded,
    at: new Date().toISOString(),
  });
}

// "Your gig is tomorrow", to everyone holding an unrefunded ticket for it.
//
// Tomorrow rather than today: a reminder that lands the morning of the show is
// too late to change anyone's evening. The unique index on
// (recipient_id, event_id) where type = 'event_upcoming' makes a second run in
// the same day a no-op, so the job is safe to retry.
async function notifyUpcomingEvents(admin: SupabaseClient): Promise<number> {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  const { data: events } = await admin
    .from("events")
    .select("id")
    .eq("event_date", tomorrow)
    .eq("active", true)
    .eq("cancelled", false);

  if (!events || events.length === 0) return 0;

  const { data: tickets } = await admin
    .from("tickets")
    .select("user_id, event_id")
    .in("event_id", events.map((e) => e.id as string))
    .eq("refunded", false);

  if (!tickets || tickets.length === 0) return 0;

  // One row per person per event, not per ticket - somebody who bought four
  // tickets wants one reminder.
  const rows = [
    ...new Map(
      tickets.map((t) => [
        `${t.user_id}:${t.event_id}`,
        { recipient_id: t.user_id, event_id: t.event_id, type: "event_upcoming" },
      ])
    ).values(),
  ];

  const { error } = await admin
    .from("notifications")
    .upsert(rows, { onConflict: "recipient_id,event_id", ignoreDuplicates: true });

  if (error) {
    // 42P01 = addendum_022 hasn't been run. Not worth failing the whole job -
    // the account purge above is the part that matters.
    if (error.code !== "42P01") console.error("notifyUpcomingEvents failed:", error);
    return 0;
  }
  return rows.length;
}
