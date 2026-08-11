import { redirect } from "next/navigation";
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

export default async function ExplorePage() {
  const supabase = await createClient();
  const user = await fetchCurrentUser(supabase);
  if (!user) redirect("/");

  const [events, savedIds, artists, genresByEvent, followedEventIds] = await Promise.all([
    fetchEvents(supabase, { activeOnly: true, city: CURRENT_CITY }),
    fetchSavedEventIds(supabase, user.id),
    fetchApprovedArtists(supabase),
    fetchGenresByEvent(supabase),
    fetchFollowedEventIds(supabase, user.id),
  ]);

  return (
    <ExploreClient
      userId={user.id}
      initialEvents={events}
      initialSavedIds={savedIds}
      artists={artists}
      genresByEvent={genresByEvent}
      followedEventIds={[...followedEventIds]}
    />
  );
}
