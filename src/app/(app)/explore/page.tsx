import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import {
  fetchApprovedArtists,
  fetchCurrentUser,
  fetchEvents,
  fetchFanPreferences,
  fetchFollowedEventIds,
  fetchGenreIdsByEvent,
  fetchGenresByEvent,
  fetchPublicProAccounts,
  fetchSavedEventIds,
} from "@/lib/supabase/queries";
import { EMPTY_PREFERENCES } from "@/lib/fan-preferences";
import ExploreClient from "./ExploreClient";
import { CURRENT_CITY } from "@/lib/city";
import { getServerT } from "@/lib/i18n/server";
import { absoluteUrl } from "@/lib/site";

// Guest-readable, in the sitemap, and the hub every /e/ page hangs off - so it
// is worth a real search snippet rather than the root layout's bare "MadGigz".
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerT();
  return {
    title: t("seo.exploreTitle"),
    description: t("seo.exploreDescription"),
    alternates: { canonical: absoluteUrl("/explore") },
  };
}

export default async function ExplorePage() {
  const supabase = await createClient();
  // Guests browse Explore too; events, artists and genres are world-readable,
  // and the per-user saved/followed sets come back empty without a session.
  const user = await fetchCurrentUser(supabase);

  const [
    events,
    savedIds,
    artists,
    proAccounts,
    genresByEvent,
    genreIdsByEvent,
    followedEventIds,
    preferences,
  ] = await Promise.all([
    fetchEvents(supabase, { activeOnly: true, city: CURRENT_CITY, upcomingOnly: true }),
    user ? fetchSavedEventIds(supabase, user.id) : Promise.resolve<string[]>([]),
    fetchApprovedArtists(supabase),
    // #88: promoters and venues are searchable too — a role='fan' pro row that
    // fetchApprovedArtists never returns.
    fetchPublicProAccounts(supabase),
    fetchGenresByEvent(supabase),
    fetchGenreIdsByEvent(supabase),
    user ? fetchFollowedEventIds(supabase, user.id) : Promise.resolve(new Set<string>()),
    // #170: the fan's saved discovery preferences boost matching shows. Guests
    // (and pre-migration) get empty preferences, so ordering is unchanged.
    user ? fetchFanPreferences(supabase, user.id) : Promise.resolve(EMPTY_PREFERENCES),
  ]);

  return (
    <ExploreClient
      userId={user?.id ?? null}
      initialEvents={events}
      initialSavedIds={savedIds}
      artists={artists}
      proAccounts={proAccounts}
      genresByEvent={genresByEvent}
      genreIdsByEvent={genreIdsByEvent}
      followedEventIds={[...followedEventIds]}
      preferences={preferences}
    />
  );
}
