import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  fetchApprovedArtists,
  fetchCurrentUser,
  fetchEvents,
  fetchSavedEventIds,
} from "@/lib/supabase/queries";
import ExploreClient from "./ExploreClient";

export default async function ExplorePage() {
  const supabase = await createClient();
  const user = await fetchCurrentUser(supabase);
  if (!user) redirect("/");

  const [events, savedIds, artists] = await Promise.all([
    fetchEvents(supabase, { activeOnly: true }),
    fetchSavedEventIds(supabase, user.id),
    fetchApprovedArtists(supabase),
  ]);

  return (
    <ExploreClient
      userId={user.id}
      initialEvents={events}
      initialSavedIds={savedIds}
      artists={artists}
    />
  );
}
