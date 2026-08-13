"use server";

import { revalidatePath } from "next/cache";
import { adminClient, requireAdmin } from "@/lib/supabase/admin-queries";
import { fetchGenres } from "@/lib/supabase/queries";
import { resolveVenue, syncEventGenres } from "@/lib/show-sync";
import { dedupKey, parseGigText } from "./gig-import-parse";

// Bulk gig importer (#111). One paste of many rows becomes many external-ticketing
// events, so the app fills with real Madrid gigs without the one-at-a-time New Show
// form. Imported shows are house/admin shows: artist_id null, external ticketing
// (a link off to Entradium/DICE/etc.), exactly the #62 shape createAdminEvent
// already writes - this is that same insert at scale.
//
// The parse + per-field validation is the pure, unit-tested gig-import-parse.ts;
// this adds only what needs the DB. ONE code path for preview and commit:
// runGigImport(text, false) dry-runs (writes nothing); runGigImport(text, true)
// re-parses the identical text and inserts only rows still "ok". The client never
// sends parsed rows back to be trusted - it sends the same text, so what you
// previewed is exactly what gets validated before writing.

// Rotated across imported shows so a freshly-seeded feed isn't monochrome. Matches
// the ACCENT_SWATCHES the New Show form offers.
const ACCENTS = ["#d76616", "#73241d", "#54c3bd", "#0d5c6d"];
const DEFAULT_MAX_PER_ORDER = 6;

export type RowStatus = "ok" | "invalid" | "duplicate" | "created";

export interface ImportRowResult {
  /** 1-based row number as pasted (excludes the header line). */
  line: number;
  title: string;
  venue: string;
  date: string;
  status: RowStatus;
  reason?: string;
}

export interface ImportResult {
  rows: ImportRowResult[];
  summary: { total: number; ok: number; invalid: number; duplicate: number; created: number };
  committed: boolean;
  /** A whole-paste problem (empty, no header, missing columns) - nothing parsed. */
  error?: string;
}

export async function runGigImport(text: string, commit: boolean): Promise<ImportResult> {
  await requireAdmin();
  const admin = adminClient();

  const emptySummary = { total: 0, ok: 0, invalid: 0, duplicate: 0, created: 0 };

  const parsed = parseGigText(text);
  if (parsed.error) {
    return { rows: [], summary: emptySummary, committed: commit, error: parsed.error };
  }

  // Existing shows, so a re-upload of the same list doesn't double-post. Keyed on
  // title+venue+date - the same identity the New Show form would collide on.
  const { data: existingEvents } = await admin.from("events").select("title, venue, event_date");
  const existingKeys = new Set(
    (existingEvents ?? []).map((e) =>
      dedupKey(String(e.title), String(e.venue), String(e.event_date))
    )
  );

  // Genre name -> id, for the optional genre column.
  const genres = await fetchGenres(admin);
  const genreByName = new Map(genres.map((g) => [g.name.toLowerCase(), g.id]));

  const results: ImportRowResult[] = [];
  const seenInBatch = new Set<string>();
  let accentCursor = 0;

  for (const gig of parsed.gigs) {
    const base = {
      line: gig.line,
      title: gig.title,
      venue: gig.venue,
      date: gig.date || gig.rawDate,
    };

    if (gig.fieldError) {
      results.push({ ...base, status: "invalid", reason: gig.fieldError });
      continue;
    }

    const key = dedupKey(gig.title, gig.venue, gig.date);
    if (existingKeys.has(key) || seenInBatch.has(key)) {
      results.push({
        ...base,
        status: "duplicate",
        reason: seenInBatch.has(key) ? "Duplicate of an earlier row" : "Already in the database",
      });
      continue;
    }
    seenInBatch.add(key);

    if (!commit) {
      results.push({ ...base, status: "ok" });
      accentCursor++;
      continue;
    }

    // Commit: create-or-link the venue, then insert exactly as createAdminEvent
    // does (external, house_run false, artist_id null).
    const venue = await resolveVenue(admin, gig.venue, null);
    if (venue.error || !venue.id) {
      results.push({ ...base, status: "invalid", reason: venue.error ?? "Couldn't save venue" });
      continue;
    }

    const genreIds = gig.genre
      .split(/[,;|]/)
      .map((g) => genreByName.get(g.trim().toLowerCase()))
      .filter((id): id is string => Boolean(id));

    const { data: created, error } = await admin
      .from("events")
      .insert({
        artist_id: null,
        venue_id: venue.id,
        title: gig.title,
        artist_name: gig.artist,
        venue: venue.name,
        city: "Madrid",
        event_date: gig.date,
        event_time: gig.time,
        price: gig.price,
        currency: "EUR",
        accent_color: ACCENTS[accentCursor % ACCENTS.length],
        category: "Live Music",
        image_url: gig.image || null,
        capacity: gig.capacity,
        max_per_order: DEFAULT_MAX_PER_ORDER,
        description: gig.description,
        lineup: [],
        doors: gig.time,
        age_restriction: gig.age,
        rating: 0,
        ticketing_mode: "external",
        ticketing_url: gig.ticketUrl,
        house_run: false,
        active: true,
        cancelled: false,
      })
      .select("id")
      .single();

    accentCursor++;

    if (error || !created) {
      if (error?.code === "42703") {
        results.push({
          ...base,
          status: "invalid",
          reason: "DB missing addendum_020 (events.house_run)",
        });
      } else {
        console.error("gig import insert failed:", error);
        results.push({ ...base, status: "invalid", reason: "Insert failed" });
      }
      continue;
    }

    if (genreIds.length > 0) await syncEventGenres(admin, created.id, genreIds);

    results.push({ ...base, status: "created" });
  }

  const summary = {
    total: results.length,
    ok: results.filter((r) => r.status === "ok").length,
    invalid: results.filter((r) => r.status === "invalid").length,
    duplicate: results.filter((r) => r.status === "duplicate").length,
    created: results.filter((r) => r.status === "created").length,
  };

  if (commit && summary.created > 0) {
    revalidatePath("/admin/events");
    revalidatePath("/explore");
    revalidatePath("/feed");
  }

  return { rows: results, summary, committed: commit };
}
