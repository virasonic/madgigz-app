import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  fetchContentPosts,
  fetchCurrentUser,
  fetchEvents,
  fetchFollowedEventIds,
  fetchSavedEventIds,
  fetchShowsByArtist,
} from "@/lib/supabase/queries";
import FeedClient from "./FeedClient";
import { isArtistRole } from "@/lib/roles";

export default async function FeedPage() {
  const supabase = await createClient();
  const user = await fetchCurrentUser(supabase);
  if (!user) redirect("/");

  const [events, posts, shows, savedIds, followedEventIds] = await Promise.all([
    fetchEvents(supabase, { activeOnly: true }),
    fetchContentPosts(supabase),
    isArtistRole(user.role) ? fetchShowsByArtist(supabase, user.id) : Promise.resolve([]),
    fetchSavedEventIds(supabase, user.id),
    fetchFollowedEventIds(supabase, user.id),
  ]);

  return (
    <FeedClient
      user={user}
      initialEvents={events}
      initialPosts={posts}
      shows={shows}
      initialSavedIds={savedIds}
      followedEventIds={[...followedEventIds]}
    />
  );
}
