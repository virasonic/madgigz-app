"use server";

import { revalidatePath } from "next/cache";
import { adminClient, requireAdmin } from "@/lib/supabase/admin-queries";
import { resolveVenue, syncEventArtists, syncEventGenres } from "@/lib/show-sync";

export interface AdminEventInput {
  title: string;
  artistName: string;
  venueName: string;
  venueId: string | null;
  date: string;
  time: string;
  price: number;
  capacity: number;
  maxPerOrder: number;
  description: string;
  lineup: string[];
  genreIds: string[];
  taggedArtistIds: string[];
  accentColor: string;
  imageUrl: string;
  ageRestriction: string;
  ticketingMode: "internal" | "external";
  ticketingUrl: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

// Shared by create and update so the two can't drift on what a valid show is.
function validate(input: AdminEventInput): string | null {
  if (!input.title.trim()) return "Title is required";
  if (!input.artistName.trim()) return "Artist name is required";
  if (!input.date) return "Date is required";
  if (!input.time) return "Time is required";
  if (!Number.isFinite(input.price) || input.price < 0) return "Price can't be negative";
  if (!Number.isInteger(input.capacity) || input.capacity < 1) return "Capacity must be at least 1";
  if (!Number.isInteger(input.maxPerOrder) || input.maxPerOrder < 1) {
    return "Max per order must be at least 1";
  }
  if (!HEX.test(input.accentColor)) return "Pick an accent colour";

  if (input.ticketingMode === "external") {
    // Validated rather than trusted: this URL is opened in the fan's browser.
    try {
      const parsed = new URL(input.ticketingUrl.trim());
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
    } catch {
      return "Enter a valid ticket link, starting with https://";
    }
  }
  return null;
}

export async function createAdminEvent(
  input: AdminEventInput
): Promise<{ id?: string; error?: string }> {
  await requireAdmin();
  const admin = adminClient();

  const invalid = validate(input);
  if (invalid) return { error: invalid };

  const title = input.title.trim();
  const artistName = input.artistName.trim();
  const external = input.ticketingMode === "external";
  const ticketingUrl = input.ticketingUrl.trim();

  const venue = await resolveVenue(admin, input.venueName, input.venueId);
  if (venue.error) return { error: venue.error };

  const { data: created, error } = await admin
    .from("events")
    .insert({
      // Always null. An admin-created show is MadGigz's, managed from here -
      // setting artist_id would hand the artist edit and delete rights over a
      // night they don't run. Platform artists are attached through
      // event_artists instead, which is what puts the show on their profile and
      // lets them post about it, exactly as a tagged support act gets today.
      artist_id: null,
      venue_id: venue.id,
      title,
      artist_name: artistName,
      venue: venue.name,
      city: "Madrid",
      event_date: input.date,
      event_time: input.time,
      // Kept even for external shows: the fan still wants to know what it
      // costs before being sent off to another site to pay it.
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
      ticketing_url: external ? ticketingUrl : null,
      // Anything MadGigz sells itself is a house show by definition. An artist
      // selling their own tickets does it from their own Add Show form, where
      // the payout account and the commission actually apply.
      house_run: !external,
      active: true,
      cancelled: false,
    })
    .select("id")
    .single();

  if (error || !created) {
    // 42703 = column missing, i.e. addendum_020 hasn't been run.
    if (error?.code === "42703") {
      console.error("events.house_run missing - run addendum_020:", error);
      return { error: "The database is missing addendum_020 - run it, then try again" };
    }
    console.error("createAdminEvent insert failed:", error);
    return { error: "Couldn't create the show" };
  }

  // The show exists from here on. Genre and tag failures are reported but don't
  // pretend the show wasn't created - same reasoning as the artist form.
  const genreError = await syncEventGenres(admin, created.id, input.genreIds);
  // No owner to exclude: the show has no artist_id, so every tagged artist is
  // a genuine tag.
  const tagError = await syncEventArtists(admin, created.id, null, input.taggedArtistIds);

  revalidatePath("/admin/events");
  revalidatePath("/explore");
  revalidatePath("/feed");

  const warning = genreError ?? tagError;
  return warning ? { id: created.id, error: `Show created, but: ${warning}` } : { id: created.id };
}


// Editing a MadGigz-created show. Price is editable here, unlike the artist's
// own edit form - there the fee split is a promise already made to whoever is
// being paid, whereas a house show is MadGigz changing its own price. It is
// still refused once tickets exist: someone has paid the old one.
export async function updateAdminEvent(
  eventId: string,
  input: AdminEventInput
): Promise<{ error?: string }> {
  await requireAdmin();
  const admin = adminClient();

  const invalid = validate(input);
  if (invalid) return { error: invalid };

  const { data: existing } = await admin
    .from("events")
    .select("id, artist_id, cancelled")
    .eq("id", eventId)
    .maybeSingle();

  if (!existing) return { error: "That show no longer exists" };
  if (existing.cancelled) return { error: "That show is cancelled and can't be edited" };
  // Artist-owned shows belong to the artist's own Manage Show sheet. An admin
  // rewriting someone else's date or price behind their back is a different
  // feature with different rules, and not this one.
  if (existing.artist_id) {
    return { error: "This show belongs to an artist - they edit it from their own profile" };
  }

  const { count: ticketCount } = await admin
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("refunded", false);

  const external = input.ticketingMode === "external";

  if ((ticketCount ?? 0) > 0 && input.price !== undefined) {
    const { data: current } = await admin
      .from("events")
      .select("price")
      .eq("id", eventId)
      .single();
    if (current && Number(current.price) !== input.price) {
      return { error: "Tickets have been sold at the current price - it can't be changed now" };
    }
  }

  const venue = await resolveVenue(admin, input.venueName, input.venueId);
  if (venue.error) return { error: venue.error };

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
      ...(input.imageUrl ? { image_url: input.imageUrl } : {}),
      capacity: input.capacity,
      max_per_order: input.maxPerOrder,
      description: input.description.trim(),
      lineup: input.lineup.map((l) => l.trim()).filter(Boolean),
      doors: input.time,
      age_restriction: input.ageRestriction,
      ticketing_mode: input.ticketingMode,
      ticketing_url: external ? input.ticketingUrl.trim() : null,
      house_run: !external,
    })
    .eq("id", eventId);

  if (error) {
    console.error("updateAdminEvent failed:", error);
    return { error: "Couldn't save the changes" };
  }

  const genreError = await syncEventGenres(admin, eventId, input.genreIds);
  const tagError = await syncEventArtists(admin, eventId, null, input.taggedArtistIds);

  revalidatePath("/admin/events");
  revalidatePath("/explore");
  revalidatePath("/feed");
  revalidatePath(`/e/${eventId}`);

  const warning = genreError ?? tagError;
  return warning ? { error: `Saved, but: ${warning}` } : {};
}
