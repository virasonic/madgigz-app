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

export async function createAdminEvent(
  input: AdminEventInput
): Promise<{ id?: string; error?: string }> {
  await requireAdmin();
  const admin = adminClient();

  const title = input.title.trim();
  const artistName = input.artistName.trim();
  if (!title) return { error: "Title is required" };
  if (!artistName) return { error: "Artist name is required" };
  if (!input.date) return { error: "Date is required" };
  if (!input.time) return { error: "Time is required" };

  if (!Number.isFinite(input.price) || input.price < 0) return { error: "Price can't be negative" };
  if (!Number.isInteger(input.capacity) || input.capacity < 1) {
    return { error: "Capacity must be at least 1" };
  }
  if (!Number.isInteger(input.maxPerOrder) || input.maxPerOrder < 1) {
    return { error: "Max per order must be at least 1" };
  }
  if (!HEX.test(input.accentColor)) return { error: "Pick an accent colour" };

  const external = input.ticketingMode === "external";
  const ticketingUrl = input.ticketingUrl.trim();
  if (external) {
    // Validated rather than trusted: this URL is opened in the fan's browser.
    try {
      const parsed = new URL(ticketingUrl);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
    } catch {
      return { error: "Enter a valid ticket link, starting with https://" };
    }
  }

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
