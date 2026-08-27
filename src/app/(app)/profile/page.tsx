import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  fetchArtistIntro,
  fetchAttendedEvents,
  fetchCurrentUser,
  fetchMadGigzShows,
  fetchSavedEventIds,
  fetchShowsByArtist,
  fetchTaggedShows,
  fetchTickets,
} from "@/lib/supabase/queries";
import ProfileClient from "./ProfileClient";
import { isArtistRole } from "@/lib/roles";
import { fetchUnreadCount } from "@/lib/notifications";
import { hasFiscalIdentity } from "@/lib/fiscal-server";

export default async function ProfilePage() {
  const supabase = await createClient();
  const user = await fetchCurrentUser(supabase);
  if (!user) redirect("/");

  const [
    savedIds,
    tickets,
    ownShows,
    taggedShows,
    madgigzShows,
    attendedEvents,
    unreadCount,
    intro,
    fiscalProvided,
  ] = await Promise.all([
      fetchSavedEventIds(supabase, user.id),
      fetchTickets(supabase, user.id),
      isArtistRole(user.role) ? fetchShowsByArtist(supabase, user.id) : Promise.resolve([]),
      isArtistRole(user.role) ? fetchTaggedShows(supabase, user.id) : Promise.resolve([]),
      // Admins run MadGigz's own (ownerless) gigs, so those appear on the admin's
      // profile alongside any shows they personally own - manage/scan from here.
      user.role === "admin" ? fetchMadGigzShows(supabase) : Promise.resolve([]),
      // The poster wall (#116) is a fan surface; artists/admins get their own tools
      // in place of the fan stats, so there's no need to run this for them.
      user.role === "fan" ? fetchAttendedEvents(supabase, user.id) : Promise.resolve([]),
      fetchUnreadCount(supabase, user.id),
      isArtistRole(user.role) ? fetchArtistIntro(supabase, user.id) : Promise.resolve(null),
      // Fiscal details (#97) are an organiser concern; fans never see the card.
      isArtistRole(user.role) ? hasFiscalIdentity(user.id) : Promise.resolve(false),
    ]);

  // An admin's own shows plus the MadGigz-organised gigs they run, merged and
  // date-sorted into one list (madgigzShows is empty for non-admins).
  const shows = [...ownShows, ...madgigzShows].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  // Scanned at the door, not "the date has passed". A ticket bought and never
  // used isn't a gig you attended, and this number sits on the same screen as
  // the Tickets tab's "Where you've been", which counts the same thing.
  //
  // It also means this page no longer reads the whole events table: the old
  // version fetched every event solely to look up each ticket's date.
  const attendedCount = tickets.filter((ticket) => ticket.checkedInAt).length;

  return (
    <ProfileClient
      user={user}
      savedCount={savedIds.length}
      attendedCount={attendedCount}
      shows={shows}
      taggedShows={taggedShows}
      attendedEvents={attendedEvents}
      unreadCount={unreadCount}
      initialIntro={intro}
      fiscalProvided={fiscalProvided}
    />
  );
}
