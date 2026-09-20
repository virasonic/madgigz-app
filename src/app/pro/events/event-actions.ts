"use server";

import { revalidatePath } from "next/cache";
import { proClient, requirePro } from "@/lib/supabase/pro-queries";
import { resolveVenue, syncEventArtists, syncEventGenres } from "@/lib/show-sync";
import { isProNotReady } from "@/lib/pro";
import type { AdminEventInput } from "@/app/admin/events/event-actions";

// The pro form is the admin form, so it sends the admin form's payload. Kept as
// a type alias rather than a second interface: the moment the two shapes drift,
// a field becomes settable on one panel and invisible on the other, which is
// exactly the bug the admin create/edit pair already avoids by sharing one.
export type ProEventInput = AdminEventInput;

const HEX = /^#[0-9a-fA-F]{6}$/;

function validate(input: ProEventInput): string | null {
  if (!input.title.trim()) return "Title is required";
  if (!input.artistName.trim()) return "Billed-as name is required";
  if (!input.date) return "Date is required";
  if (!input.time) return "Time is required";
  if (!Number.isFinite(input.price) || input.price < 0) return "Price can't be negative";
  if (!Number.isInteger(input.capacity) || input.capacity < 1) return "Capacity must be at least 1";
  if (!Number.isInteger(input.maxPerOrder) || input.maxPerOrder < 1) {
    return "Max per order must be at least 1";
  }
  if (!HEX.test(input.accentColor)) return "Pick an accent colour";

  if (input.ticketingMode === "external") {
    // Validated rather than trusted: this URL is opened in a fan's browser.
    try {
      const parsed = new URL(input.ticketingUrl.trim());
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
    } catch {
      return "Enter a valid ticket link, starting with https://";
    }
  }
  return null;
}

// Selling through MadGigz means a Stripe destination charge into this account,
// so there has to be an account able to receive one. Same rule an artist gets
// (#85), enforced here rather than left to checkout: a paid show that errors at
// the moment a fan tries to buy is a worse way to learn this than a sentence on
// the form. Free and external-link shows are unaffected - neither moves money.
async function payoutBlocked(profileId: string, input: ProEventInput): Promise<string | null> {
  if (input.ticketingMode === "external" || input.price <= 0) return null;

  const { data } = await proClient()
    .from("profiles")
    .select("stripe_payouts_ready")
    .eq("id", profileId)
    .maybeSingle();

  if (data?.stripe_payouts_ready) return null;
  return "Connect payouts before selling paid tickets. Free shows and external ticket links work right away.";
}

// A venue account books into its own room, full stop. Letting it file a show at
// someone else's address would put that show on the other venue's calendar,
// which is the one thing the venue scoping rule is for.
async function venueFor(
  accountType: "promoter" | "venue",
  accountVenueId: string | null,
  input: ProEventInput
) {
  const admin = proClient();
  if (accountType === "venue" && accountVenueId) {
    const { data } = await admin.from("venues").select("id, name").eq("id", accountVenueId).single();
    if (!data) return { id: null, name: "", error: "Your venue is no longer set up - contact MadGigz" };
    return { id: data.id, name: data.name, error: null };
  }
  return resolveVenue(admin, input.venueName, input.venueId);
}

export async function createProEvent(
  input: ProEventInput
): Promise<{ id?: string; error?: string }> {
  const { userId, account } = await requirePro();
  const admin = proClient();

  const invalid = validate(input);
  if (invalid) return { error: invalid };

  const blocked = await payoutBlocked(userId, input);
  if (blocked) return { error: blocked };

  const venue = await venueFor(account.type, account.venueId, input);
  if (venue.error) return { error: venue.error };

  const external = input.ticketingMode === "external";

  const { data: created, error } = await admin
    .from("events")
    .insert({
      // Null, deliberately. artist_id means "the performer runs this show" and
      // carries edit/delete rights through the artist RLS policies; a promoter's
      // booking doesn't hand those to the act. Platform artists are attached
      // through event_artists instead, which is what puts the show on their
      // profile and lets them post about it - same as an admin-created show.
      artist_id: null,
      pro_account_id: account.id,
      venue_id: venue.id,
      title: input.title.trim(),
      artist_name: input.artistName.trim(),
      venue: venue.name,
      city: "Madrid",
      event_date: input.date,
      event_time: input.time,
      price: input.price,
      currency: "EUR",
      accent_color: input.accentColor,
      category: "Live Music",
      image_url: input.imageUrl || null,
      capacity: input.capacity,
      max_per_order: input.maxPerOrder,
      description: input.description.trim(),
      lineup: input.lineup.map((l) => l.trim()).filter(Boolean),
      doors: input.time,
      age_restriction: input.ageRestriction,
      rating: 0,
      ticketing_mode: input.ticketingMode,
      ticketing_url: external ? input.ticketingUrl.trim() : null,
      // Never. house_run means "MadGigz keeps the money and takes no
      // commission"; a promoter's show pays the promoter, with the usual fee.
      house_run: false,
      active: true,
      cancelled: false,
    })
    .select("id")
    .single();

  if (error || !created) {
    // events.pro_account_id missing, i.e. addendum_051 hasn't been run here.
    if (isProNotReady(error)) {
      console.error("events.pro_account_id missing - run addendum_051:", error);
      return { error: "The database is missing addendum_051 - run it, then try again" };
    }
    console.error("createProEvent insert failed:", error);
    return { error: "Couldn't create the show" };
  }

  // The show exists from here on, so tag/genre failures are reported without
  // pretending it wasn't created - same reasoning as the admin form.
  const genreError = await syncEventGenres(admin, created.id, input.genreIds);
  const tagError = await syncEventArtists(admin, created.id, null, input.taggedArtistIds);

  revalidatePath("/pro/events");
  revalidatePath("/explore");
  revalidatePath("/feed");

  const warning = genreError ?? tagError;
  return warning ? { id: created.id, error: `Show created, but: ${warning}` } : { id: created.id };
}

export async function updateProEvent(
  eventId: string,
  input: ProEventInput
): Promise<{ error?: string }> {
  const { userId, account } = await requirePro();
  const admin = proClient();

  const invalid = validate(input);
  if (invalid) return { error: invalid };

  // Ownership is re-derived from the row, never trusted from the caller - this
  // is a public POST endpoint, and a venue can see shows in its room that it
  // must not be able to rewrite.
  const { data: existing } = await admin
    .from("events")
    .select("id, pro_account_id, cancelled, price")
    .eq("id", eventId)
    .maybeSingle();

  if (!existing || existing.pro_account_id !== account.id) {
    return { error: "That show isn't yours to edit" };
  }
  if (existing.cancelled) return { error: "That show is cancelled and can't be edited" };

  const blocked = await payoutBlocked(userId, input);
  if (blocked) return { error: blocked };

  // Someone has already paid the current price; changing it now would mean two
  // fans holding the same ticket at different prices, with the fee split
  // already settled on the first.
  if (Number(existing.price) !== input.price) {
    const { count } = await admin
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("refunded", false);
    if ((count ?? 0) > 0) {
      return { error: "Tickets have been sold at the current price - it can't be changed now" };
    }
  }

  const venue = await venueFor(account.type, account.venueId, input);
  if (venue.error) return { error: venue.error };

  const external = input.ticketingMode === "external";

  const { error } = await admin
    .from("events")
    .update({
      venue_id: venue.id,
      title: input.title.trim(),
      artist_name: input.artistName.trim(),
      venue: venue.name,
      event_date: input.date,
      event_time: input.time,
      price: input.price,
      accent_color: input.accentColor,
      // Only overwrite the poster when a new one was actually uploaded - an
      // empty string here means "unchanged", not "remove it".
      ...(input.imageUrl ? { image_url: input.imageUrl } : {}),
      capacity: input.capacity,
      max_per_order: input.maxPerOrder,
      description: input.description.trim(),
      lineup: input.lineup.map((l) => l.trim()).filter(Boolean),
      doors: input.time,
      age_restriction: input.ageRestriction,
      ticketing_mode: input.ticketingMode,
      ticketing_url: external ? input.ticketingUrl.trim() : null,
    })
    .eq("id", eventId);

  if (error) {
    console.error("updateProEvent failed:", error);
    return { error: "Couldn't save the changes" };
  }

  const genreError = await syncEventGenres(admin, eventId, input.genreIds);
  const tagError = await syncEventArtists(admin, eventId, null, input.taggedArtistIds);

  revalidatePath("/pro/events");
  revalidatePath("/explore");
  revalidatePath("/feed");
  revalidatePath(`/e/${eventId}`);

  const warning = genreError ?? tagError;
  return warning ? { error: `Saved, but: ${warning}` } : {};
}

// Hiding, not deleting: it comes off Feed and Explore while the row, its
// tickets and its history stay exactly as they were. Cancelling a show with
// tickets sold means refunding real money, which stays an admin action - a
// promoter asks MadGigz for it rather than pressing it themselves.
export async function setProEventActive(
  eventId: string,
  active: boolean
): Promise<{ error?: string }> {
  const { account } = await requirePro();
  const admin = proClient();

  const { data: existing } = await admin
    .from("events")
    .select("id, pro_account_id")
    .eq("id", eventId)
    .maybeSingle();

  if (!existing || existing.pro_account_id !== account.id) {
    return { error: "That show isn't yours" };
  }

  const { error } = await admin.from("events").update({ active }).eq("id", eventId);
  if (error) {
    console.error("setProEventActive failed:", error);
    return { error: "Couldn't update the show" };
  }

  revalidatePath("/pro/events");
  revalidatePath("/explore");
  revalidatePath("/feed");
  return {};
}
