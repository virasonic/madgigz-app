import { NextResponse } from "next/server";
import { FEE_PERCENT, MIN_FEE_CENTS, VAT_PERCENT } from "@/lib/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// (staging bring-up: forcing a fresh commit hash so a new build is verifiable)

// Lets a deploy be verified from outside: which commit is actually live, and
// whether the configuration it needs is present. Added after three production
// deploys failed silently while the site kept serving an older build - a green
// local build proves nothing about what Vercel is running.
//
// Reports only booleans and non-secret pricing config. Never echo a key value
// here: this endpoint is public.
export async function GET() {
  // Presence alone isn't enough: pasting a whsec_ into STRIPE_SECRET_KEY reads
  // as "set" but fails at the first Stripe call, which is how it was actually
  // found - an artist hitting "Connect payouts" and getting "Invalid API Key".
  // The expected prefix catches that class of mix-up straight away.
  const required = [
    { key: "NEXT_PUBLIC_SUPABASE_URL", prefix: "https://" },
    { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", prefix: null },
    { key: "SUPABASE_SERVICE_ROLE_KEY", prefix: null },
    { key: "STRIPE_SECRET_KEY", prefix: "sk_" },
    { key: "STRIPE_WEBHOOK_SECRET", prefix: "whsec_" },
    { key: "STRIPE_WEBHOOK_SECRET_CONNECT", prefix: "whsec_", optional: true },
    { key: "RESEND_API_KEY", prefix: "re_" },
    { key: "NEXT_PUBLIC_APP_URL", prefix: "http" },
    // Optional: signup falls back to no captcha when these are unset (see
    // signup/page.tsx), so a missing value shouldn't fail the whole deploy -
    // but a wrong-prefix paste (e.g. the secret key in the site-key slot)
    // should still show up here rather than fail silently at signup time.
    { key: "NEXT_PUBLIC_TURNSTILE_SITE_KEY", prefix: "0x", optional: true },
    { key: "TURNSTILE_SECRET_KEY", prefix: "0x", optional: true },
  ] as const;

  const config = Object.fromEntries(
    required.map(({ key, prefix }) => {
      const value = process.env[key];
      if (!value) return [key, "missing"];
      if (prefix && !value.startsWith(prefix)) return [key, `wrong-format (expected ${prefix}…)`];
      return [key, "ok"];
    })
  );

  const missing = required
    .filter((r) => !("optional" in r && r.optional) && !process.env[r.key])
    .map((r) => r.key);

  const malformed = required
    .filter((r) => {
      const value = process.env[r.key];
      return value && r.prefix && !value.startsWith(r.prefix);
    })
    .map((r) => r.key);

  return NextResponse.json({
    ok: missing.length === 0 && malformed.length === 0,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local",
    // Safe to echo: this is the public site origin, and getting it wrong sends
    // paying customers to a dead page after checkout, so it's worth surfacing.
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
    // Just the host of the Supabase project this deploy talks to - never a key.
    // The URL already ships in the browser bundle, so it isn't secret, and it's
    // the one reliable way to confirm a staging deploy points at its OWN database
    // and not production (the whole point of #108). Prod and staging must show
    // different hosts here; if staging shows the prod host, an env var is leaking
    // across environments - see docs/staging.md.
    supabaseHost: (() => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!url) return null;
      try {
        return new URL(url).host;
      } catch {
        return "unparseable";
      }
    })(),
    // Just the mode, never the key. Whether Stripe is test or live isn't secret
    // (the checkout page and the in-app notice both reveal it), and surfacing it
    // is the reliable way to confirm a soft launch isn't quietly taking real
    // money - and, at go-live, that it finally is.
    stripeMode: process.env.STRIPE_SECRET_KEY?.startsWith("sk_live")
      ? "live"
      : process.env.STRIPE_SECRET_KEY?.startsWith("sk_test")
        ? "test"
        : "unknown",
    pricing: { feePercent: FEE_PERCENT, vatPercent: VAT_PERCENT, minFeeCents: MIN_FEE_CENTS },
    config,
    missing,
    malformed,
  });
}
