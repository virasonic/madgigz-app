import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  fetchCurrentUser,
  fetchEvents,
  fetchSavedEventIds,
  fetchShowsByArtist,
  fetchTickets,
} from "@/lib/supabase/queries";
import ProfileClient from "./ProfileClient";

// Computed once at module load rather than during render, per React's purity rules.
const NOW = Date.now();

export default async function ProfilePage() {
  const supabase = await createClient();
  const user = await fetchCurrentUser(supabase);
  if (!user) redirect("/");

  const [savedIds, tickets, events, shows] = await Promise.all([
    fetchSavedEventIds(supabase, user.id),
    fetchTickets(supabase, user.id),
    fetchEvents(supabase),
    user.role === "artist" ? fetchShowsByArtist(supabase, user.id) : Promise.resolve([]),
  ]);

  const attendedCount = tickets.filter((ticket) => {
    const event = events.find((e) => e.id === ticket.eventId);
    return event && new Date(event.date).getTime() < NOW;
  }).length;

  return (
    <ProfileClient
      user={user}
      savedCount={savedIds.length}
      attendedCount={attendedCount}
      shows={shows}
    />
  );
}
