import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  fetchAttendedEvents,
  fetchCurrentUser,
  fetchNotAttendedEventIds,
  fetchPastSavedEvents,
} from "@/lib/supabase/queries";
import RecuerdosClient from "./RecuerdosClient";

// #230: Recuerdos is its own bottom-nav tab now — the attended "memories" wall
// and the "Share my wall" export that used to live on the profile. Fan-only: an
// organiser/admin has their own tools in place of the fan walls, so they're sent
// to their profile; a guest is sent to sign in. The attended wall and the
// "Were you there?" prompt are #116.
export default async function RecuerdosPage() {
  const supabase = await createClient();
  const user = await fetchCurrentUser(supabase);
  if (!user) redirect("/signin?next=/recuerdos");
  if (user.role !== "fan") redirect("/profile");

  const [attendedEvents, pastSaved, notAttendedIds] = await Promise.all([
    fetchAttendedEvents(supabase, user.id),
    fetchPastSavedEvents(supabase, user.id),
    fetchNotAttendedEventIds(supabase, user.id),
  ]);

  // "Were you there?" candidates: past shows the fan saved that aren't already on
  // the wall (scanned or manually marked) and haven't been answered "no".
  const attendedIds = new Set(attendedEvents.map((e) => e.id));
  const notAttended = new Set(notAttendedIds);
  const attendanceCandidates = pastSaved.filter(
    (e) => !attendedIds.has(e.id) && !notAttended.has(e.id)
  );

  return (
    <RecuerdosClient attendedEvents={attendedEvents} attendanceCandidates={attendanceCandidates} />
  );
}
