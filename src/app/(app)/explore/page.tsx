import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import {
  fetchApprovedArtists,
  fetchCurrentUser,
  fetchEvents,
  fetchFollowedEventIds,
  fetchGenresByEvent,
  fetchSavedEventIds,
} from "@/lib/supabase/queries";
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

  const [events, savedIds, artists, genresByEvent, followedEventIds] = await Promise.all([
    fetchEvents(supabase, { activeOnly: true, city: CURRENT_CITY, upcomingOnly: true }),
    user ? fetchSavedEventIds(supabase, user.id) : Promise.resolve<string[]>([]),
    fetchApprovedArtists(supabase),
    fetchGenresByEvent(supabase),
    user ? fetchFollowedEventIds(supabase, user.id) : Promise.resolve(new Set<string>()),
  ]);

  return (
    <ExploreClient
      userId={user?.id ?? null}
      initialEvents={events}
      initialSavedIds={savedIds}
      artists={artists}
      genresByEvent={genresByEvent}
      followedEventIds={[...followedEventIds]}
    />
  );
}
