import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { purgeDueAccounts } from "@/lib/account-deletion";

// Deletion requests sit for 30 days and then have to actually happen. Vercel
// Cron calls this daily (see vercel.json) and sends Authorization: Bearer
// $CRON_SECRET, which is the only thing standing between this endpoint and the
// open internet.
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

  const results = await purgeDueAccounts(createAdminClient());
  if (results.failed.length > 0) {
    console.error("purge-accounts: some accounts failed", results.failed);
  }

  return NextResponse.json({
    purged: results.purged,
    failed: results.failed.length,
    at: new Date().toISOString(),
  });
}
