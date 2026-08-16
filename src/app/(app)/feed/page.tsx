import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  fetchContentPosts,
  fetchCurrentUser,
  fetchEvents,
  fetchFollowedEventIds,
  fetchIntroReels,
  fetchSavedEventIds,
  fetchShowsByArtist,
} from "@/lib/supabase/queries";
import FeedClient from "./FeedClient";
import { isArtistRole } from "@/lib/roles";
import { CURRENT_CITY } from "@/lib/city";

export default async function FeedPage() {
  const supabase = await createClient();
  const user = await fetchCurrentUser(supabase);
  if (!user) redirect("/");

  const [events, posts, shows, savedIds, followedEventIds, intros] = await Promise.all([
    fetchEvents(supabase, { activeOnly: true, city: CURRENT_CITY }),
    fetchContentPosts(supabase),
    isArtistRole(user.role) ? fetchShowsByArtist(supabase, user.id) : Promise.resolve([]),
    fetchSavedEventIds(supabase, user.id),
    fetchFollowedEventIds(supabase, user.id),
    fetchIntroReels(supabase),
  ]);

  return (
    <FeedClient
      user={user}
      initialEvents={events}
      initialPosts={posts}
      initialIntros={intros}
      shows={shows}
      initialSavedIds={savedIds}
      followedEventIds={[...followedEventIds]}
    />
  );
}
