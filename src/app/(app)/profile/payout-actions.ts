"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { payoutsReady, stripe } from "@/lib/stripe";

// Server Actions are public POST endpoints, so the caller is re-derived from
// the session here rather than trusted from an argument.
async function requireArtist() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, artist_status, artist_name, stripe_account_id")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "artist") throw new Error("Not an artist");
  if (profile.artist_status !== "approved") throw new Error("Artist not approved yet");

  return { user, profile };
}

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

// Returns a Stripe-hosted onboarding URL for the caller to redirect to.
// Account Links are single-use and expire in minutes, so a fresh one is minted
// on every click and never stored.
export async function startPayoutOnboarding(): Promise<{ url: string | null; error: string | null }> {
  try {
    const { user, profile } = await requireArtist();
    const admin = createAdminClient();

    let accountId = profile.stripe_account_id as string | null;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "ES",
        email: user.email,
        business_profile: {
          name: profile.artist_name ?? undefined,
          product_description: "Live music event tickets sold through MadGigz",
        },
        capabilities: {
          transfers: { requested: true },
          card_payments: { requested: true },
        },
        // Ticket money accumulates in the artist's Stripe balance but can only
        // reach their bank when MadGigz triggers the payout - after the event
        // has happened. Closes the sell-tickets-withdraw-cancel fraud hole,
        // and guarantees refunds always have a balance to reverse against.
        settings: {
          payouts: { schedule: { interval: "manual" } },
        },
      });
      accountId = account.id;
      await admin.from("profiles").update({ stripe_account_id: accountId }).eq("id", user.id);
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${appUrl()}/profile?payout=refresh`,
      return_url: `${appUrl()}/profile?payout=return`,
      type: "account_onboarding",
    });

    return { url: link.url, error: null };
  } catch (error) {
    return { url: null, error: error instanceof Error ? error.message : "Something went wrong" };
  }
}

// Pulls the current capability state from Stripe and caches it on the profile.
// Called when the artist returns from onboarding; the account.updated webhook
// keeps it fresh afterwards.
export async function refreshPayoutStatus(): Promise<{ ready: boolean; error: string | null }> {
  try {
    const { user, profile } = await requireArtist();
    const accountId = profile.stripe_account_id as string | null;
    if (!accountId) return { ready: false, error: null };

    const account = await stripe.accounts.retrieve(accountId);
    const ready = payoutsReady(account);

    const admin = createAdminClient();
    await admin.from("profiles").update({ stripe_payouts_ready: ready }).eq("id", user.id);

    revalidatePath("/profile");
    return { ready, error: null };
  } catch (error) {
    return { ready: false, error: error instanceof Error ? error.message : "Something went wrong" };
  }
}

// Stripe-hosted dashboard where a connected artist can see their payouts.
export async function openPayoutDashboard(): Promise<{ url: string | null; error: string | null }> {
  try {
    const { profile } = await requireArtist();
    const accountId = profile.stripe_account_id as string | null;
    if (!accountId) return { url: null, error: "Connect payouts first" };

    const link = await stripe.accounts.createLoginLink(accountId);
    return { url: link.url, error: null };
  } catch (error) {
    return { url: null, error: error instanceof Error ? error.message : "Something went wrong" };
  }
}
