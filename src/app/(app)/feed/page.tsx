import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  fetchContentPosts,
  fetchCurrentUser,
  fetchEvents,
  fetchShowsByArtist,
} from "@/lib/supabase/queries";
import FeedClient from "./FeedClient";

export default async function FeedPage() {
  const supabase = await createClient();
  const user = await fetchCurrentUser(supabase);
  if (!user) redirect("/");

  const [events, posts, shows] = await Promise.all([
    fetchEvents(supabase, { activeOnly: true }),
    fetchContentPosts(supabase),
    user.role === "artist" ? fetchShowsByArtist(supabase, user.id) : Promise.resolve([]),
  ]);

  return (
    <FeedClient user={user} initialEvents={events} initialPosts={posts} shows={shows} />
  );
}
