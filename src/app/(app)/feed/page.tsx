import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  fetchContentPosts,
  fetchCurrentUser,
  fetchEvents,
  fetchSavedEventIds,
  fetchShowsByArtist,
} from "@/lib/supabase/queries";
import FeedClient from "./FeedClient";

export default async function FeedPage() {
  const supabase = await createClient();
  const user = await fetchCurrentUser(supabase);
  if (!user) redirect("/");

  const [events, posts, shows, savedIds] = await Promise.all([
    fetchEvents(supabase, { activeOnly: true }),
    fetchContentPosts(supabase),
    user.role === "artist" ? fetchShowsByArtist(supabase, user.id) : Promise.resolve([]),
    fetchSavedEventIds(supabase, user.id),
  ]);

  return (
    <FeedClient
      user={user}
      initialEvents={events}
      initialPosts={posts}
      shows={shows}
      initialSavedIds={savedIds}
    />
  );
}
