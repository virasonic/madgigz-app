import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchCurrentUser, fetchSavedEventIds } from "@/lib/supabase/queries";
import {
  fetchEventsByIds,
  fetchFriendActivity,
  fetchFriendships,
  fetchShareInterested,
} from "@/lib/friends";
import FriendsClient from "./FriendsClient";

// #149: the Friends tab. Who you're friends with, who wants to be, and what
// they're going to soon. All of it is scoped to the signed-in person by RLS and
// the security-definer RPC; nothing here is reachable for a guest.
export default async function FriendsPage() {
  const supabase = await createClient();
  const user = await fetchCurrentUser(supabase);
  if (!user) redirect("/signin?next=/friends");

  const [links, activity, shareInterested, savedIds] = await Promise.all([
    fetchFriendships(supabase, user.id),
    fetchFriendActivity(supabase),
    fetchShareInterested(supabase, user.id),
    fetchSavedEventIds(supabase, user.id),
  ]);

  // The "going soon" rail: upcoming shows at least one friend is going to or
  // interested in. Been rows feed the per-friend counts only.
  const upcomingIds = activity.filter((a) => a.kind !== "been").map((a) => a.eventId);
  const events = await fetchEventsByIds(supabase, upcomingIds);

  return (
    <FriendsClient
      userId={user.id}
      username={user.username}
      links={links}
      activity={activity}
      events={events}
      initialSavedIds={savedIds}
      initialShareInterested={shareInterested}
    />
  );
}
