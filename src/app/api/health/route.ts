import { NextResponse } from "next/server";
import { FEE_PERCENT, MIN_FEE_CENTS, VAT_PERCENT } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lets a deploy be verified from outside: which commit is actually live, and
// whether the configuration it needs is present. Added after three production
// deploys failed silently while the site kept serving an older build - a green
// local build proves nothing about what Vercel is running.
//
// Reports only booleans and non-secret pricing config. Never echo a key value
// here: this endpoint is public.
export async function GET() {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "RESEND_API_KEY",
    "NEXT_PUBLIC_APP_URL",
  ] as const;

  const config = Object.fromEntries(
    required.map((key) => [key, Boolean(process.env[key])])
  );

  const missing = required.filter((key) => !process.env[key]);

  return NextResponse.json({
    ok: missing.length === 0,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    // Safe to echo: this is the public site origin, and getting it wrong sends
    // paying customers to a dead page after checkout, so it's worth surfacing.
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
    pricing: { feePercent: FEE_PERCENT, vatPercent: VAT_PERCENT, minFeeCents: MIN_FEE_CENTS },
    config,
    missing,
  });
}
