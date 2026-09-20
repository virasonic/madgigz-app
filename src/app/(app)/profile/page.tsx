import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  fetchArtistIntro,
  fetchAttendedEvents,
  fetchCurrentUser,
  fetchMadGigzShows,
  fetchPastSavedEvents,
  fetchSavedEvents,
  fetchShowsByArtist,
  fetchTaggedShows,
  fetchTickets,
} from "@/lib/supabase/queries";
import ProfileClient from "./ProfileClient";
import { isArtistRole } from "@/lib/roles";
import { fetchUnreadCount } from "@/lib/notifications";
import { hasFiscalIdentity } from "@/lib/fiscal-server";
import { fetchProAccount } from "@/lib/pro";

export default async function ProfilePage() {
  const supabase = await createClient();
  const user = await fetchCurrentUser(supabase);
  if (!user) redirect("/");

  const [
    savedEvents,
    tickets,
    ownShows,
    taggedShows,
    madgigzShows,
    attendedEvents,
    pastSaved,
    unreadCount,
    intro,
    fiscalProvided,
    proAccount,
  ] = await Promise.all([
      // Fan-only, like the attended wall below: the saved grid is a fan surface,
      // and the count now reflects what the grid shows (upcoming saved), so a
      // tapped "3" never opens onto a different number.
      user.role === "fan" ? fetchSavedEvents(supabase, user.id) : Promise.resolve([]),
      fetchTickets(supabase, user.id),
      isArtistRole(user.role) ? fetchShowsByArtist(supabase, user.id) : Promise.resolve([]),
      isArtistRole(user.role) ? fetchTaggedShows(supabase, user.id) : Promise.resolve([]),
      // Admins run MadGigz's own (ownerless) gigs, so those appear on the admin's
      // profile alongside any shows they personally own - manage/scan from here.
      user.role === "admin" ? fetchMadGigzShows(supabase) : Promise.resolve([]),
      // The poster wall (#116) is a fan surface; artists/admins get their own tools
      // in place of the fan stats, so there's no need to run this for them.
      user.role === "fan" ? fetchAttendedEvents(supabase, user.id) : Promise.resolve([]),
      // Past saved shows -> candidates for the "Were you there?" prompt.
      user.role === "fan" ? fetchPastSavedEvents(supabase, user.id) : Promise.resolve([]),
      fetchUnreadCount(supabase, user.id),
      isArtistRole(user.role) ? fetchArtistIntro(supabase, user.id) : Promise.resolve(null),
      // Fiscal details (#97) are an organiser concern; fans never see the card.
      isArtistRole(user.role) ? hasFiscalIdentity(user.id) : Promise.resolve(false),
      // Promoters and venues (#88) reach their panel from here, the way an
      // admin reaches theirs. Read with the caller's own client - addendum_051
      // lets a pro user select their own row, and nobody else's.
      fetchProAccount(supabase, user.id),
    ]);

  // An admin's own shows plus the MadGigz-organised gigs they run, merged and
  // date-sorted into one list (madgigzShows is empty for non-admins).
  const shows = [...ownShows, ...madgigzShows].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // The wall now counts scanned-in tickets AND manual "I was there" marks, so the
  // stat tracks the wall (attendedEvents is already that union, deduped).
  const attendedCount = attendedEvents.length;

  // "Were you there?" candidates: past shows the fan saved that aren't already on
  // the wall (scanned or manually marked). Those are exactly the ones worth
  // asking about.
  const attendedIds = new Set(attendedEvents.map((e) => e.id));
  const attendanceCandidates = pastSaved.filter((e) => !attendedIds.has(e.id));

  return (
    <ProfileClient
      user={user}
      savedCount={savedEvents.length}
      attendedCount={attendedCount}
      shows={shows}
      taggedShows={taggedShows}
      savedEvents={savedEvents}
      attendedEvents={attendedEvents}
      attendanceCandidates={attendanceCandidates}
      unreadCount={unreadCount}
      initialIntro={intro}
      fiscalProvided={fiscalProvided}
      proType={proAccount?.active ? proAccount.type : null}
    />
  );
}
