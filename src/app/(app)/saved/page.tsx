import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  fetchCurrentUser,
  fetchEvents,
  fetchSavedEventIds,
  fetchTickets,
} from "@/lib/supabase/queries";
import SavedClient from "./SavedClient";

export default async function SavedPage() {
  const supabase = await createClient();
  const user = await fetchCurrentUser(supabase);
  if (!user) redirect("/");

  const [events, savedIds, tickets] = await Promise.all([
    fetchEvents(supabase),
    fetchSavedEventIds(supabase, user.id),
    fetchTickets(supabase, user.id),
  ]);

  return (
    <SavedClient
      userId={user.id}
      initialEvents={events}
      initialSavedIds={savedIds}
      initialTickets={tickets}
    />
  );
}
