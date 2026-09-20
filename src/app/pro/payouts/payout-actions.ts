"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { payoutsReady, stripe } from "@/lib/stripe";
import { requirePro } from "@/lib/supabase/pro-queries";

// A promoter or venue is an organiser, exactly like an artist selling their own
// night, so this is the artist payout flow with the organiser swapped out: an
// Express account on a manual payout schedule, money accumulating in their
// Stripe balance as tickets sell, released by MadGigz once the show has
// happened. Written out rather than shared with the artist actions because the
// guard differs (requirePro vs requireArtist) and the copy differs; the Stripe
// shape is deliberately identical so /admin/payouts can treat both the same.

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

// Stripe's own error text is written for developers and can contain fragments
// of keys and account ids - it belongs in the logs, not in an organiser's face.
const SAFE_MESSAGES = new Set([
  "Not signed in",
  "Not authorized",
  "This pro account has been deactivated",
]);

function userFacingError(error: unknown, context: string): string {
  console.error(`${context} failed:`, error);
  if (error instanceof Error && SAFE_MESSAGES.has(error.message)) return error.message;
  return "Something went wrong connecting to Stripe. Please try again, or contact MadGigz if it keeps happening.";
}

/**
 * Returns a Stripe-hosted onboarding URL for the caller to redirect to. Account
 * Links are single-use and expire in minutes, so a fresh one is minted on every
 * click and never stored.
 */
export async function startProPayoutOnboarding(): Promise<{ url: string | null; error: string | null }> {
  try {
    const { userId, account } = await requirePro();
    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_account_id")
      .eq("id", userId)
      .maybeSingle();

    let accountId = (profile?.stripe_account_id as string | null) ?? null;

    if (!accountId) {
      const { data: authUser } = await admin.auth.admin.getUserById(userId);
      const created = await stripe.accounts.create({
        type: "express",
        country: "ES",
        email: authUser?.user?.email ?? undefined,
        business_profile: {
          name: account.displayName,
          product_description: "Live music event tickets sold through MadGigz",
        },
        capabilities: {
          transfers: { requested: true },
          card_payments: { requested: true },
        },
        // Ticket money accumulates in the organiser's Stripe balance but can
        // only reach their bank when MadGigz triggers the payout, after the
        // event. Closes the sell-tickets-withdraw-cancel hole and guarantees
        // refunds always have a balance to reverse against.
        settings: {
          payouts: { schedule: { interval: "manual" } },
        },
      });
      accountId = created.id;
      await admin.from("profiles").update({ stripe_account_id: accountId }).eq("id", userId);
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${appUrl()}/pro/payouts?stripe=refresh`,
      return_url: `${appUrl()}/pro/payouts?stripe=return`,
      type: "account_onboarding",
    });

    return { url: link.url, error: null };
  } catch (error) {
    return { url: null, error: userFacingError(error, "startProPayoutOnboarding") };
  }
}

/**
 * Pulls the current capability state from Stripe and caches it on the profile.
 * Called when the organiser returns from onboarding; the account.updated
 * webhook keeps it fresh afterwards.
 */
export async function refreshProPayoutStatus(): Promise<{ ready: boolean; error: string | null }> {
  try {
    const { userId } = await requirePro();
    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_account_id")
      .eq("id", userId)
      .maybeSingle();

    const accountId = (profile?.stripe_account_id as string | null) ?? null;
    if (!accountId) return { ready: false, error: null };

    const stripeAccount = await stripe.accounts.retrieve(accountId);
    const ready = payoutsReady(stripeAccount);

    await admin.from("profiles").update({ stripe_payouts_ready: ready }).eq("id", userId);

    revalidatePath("/pro/payouts");
    revalidatePath("/pro");
    return { ready, error: null };
  } catch (error) {
    return { ready: false, error: userFacingError(error, "refreshProPayoutStatus") };
  }
}

/** Stripe-hosted dashboard where a connected organiser can see their payouts. */
export async function openProPayoutDashboard(): Promise<{ url: string | null; error: string | null }> {
  try {
    const { userId } = await requirePro();
    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("profiles")
      .select("stripe_account_id")
      .eq("id", userId)
      .maybeSingle();

    const accountId = (profile?.stripe_account_id as string | null) ?? null;
    if (!accountId) return { url: null, error: "Connect payouts first" };

    const link = await stripe.accounts.createLoginLink(accountId);
    return { url: link.url, error: null };
  } catch (error) {
    return { url: null, error: userFacingError(error, "openProPayoutDashboard") };
  }
}
