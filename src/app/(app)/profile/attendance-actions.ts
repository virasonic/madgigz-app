"use server";

import { createClient } from "@/lib/supabase/server";

// Manual "I was there" attendance (#116 manual path). Owner-scoped: it only ever
// writes the caller's own row (RLS enforces it too). Returns a boolean rather
// than throwing so the UI can fail softly - including the pre-migration case
// where attended_events doesn't exist yet.

// Only a show whose date has already passed can be marked attended - you can't
// have been to a gig that hasn't happened. The UI only offers the button on past
// shows; this is the server-side guard behind it.
async function isPastEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("events")
    .select("event_date")
    .eq("id", eventId)
    .maybeSingle();
  if (!data) return false;
  return (data.event_date as string) < new Date().toISOString().slice(0, 10);
}

export async function markAttended(eventId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  if (!(await isPastEvent(supabase, eventId))) return { ok: false };

  const { error } = await supabase
    .from("attended_events")
    .upsert({ user_id: user.id, event_id: eventId });
  return { ok: !error };
}

export async function unmarkAttended(eventId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { error } = await supabase
    .from("attended_events")
    .delete()
    .eq("user_id", user.id)
    .eq("event_id", eventId);
  return { ok: !error };
}
