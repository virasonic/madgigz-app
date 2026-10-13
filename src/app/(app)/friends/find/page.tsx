import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchCurrentUser } from "@/lib/supabase/queries";
import { fetchFriendSuggestions, fetchFriendships } from "@/lib/friends";
import FindFriendsClient from "./FindFriendsClient";

// #149: finding friends without a contacts upload. Username search, your own
// profile QR (any camera app opens the link), a shareable invite link, and
// friends-of-friends suggestions.
export default async function FindFriendsPage() {
  const supabase = await createClient();
  const user = await fetchCurrentUser(supabase);
  if (!user) redirect("/signin?next=/friends/find");

  const [links, suggestions] = await Promise.all([
    fetchFriendships(supabase, user.id),
    fetchFriendSuggestions(supabase),
  ]);

  return (
    <FindFriendsClient
      username={user.username}
      links={links}
      suggestions={suggestions}
    />
  );
}
