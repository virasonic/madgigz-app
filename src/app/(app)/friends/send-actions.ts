"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// #149 Phase B: sending a gig or a spare ticket to a friend. Both go through
// security-definer RPCs that verify the friendship server-side, with the
// caller's own session so auth.uid() is the sender.

export async function sendEventToFriends(
  eventId: string,
  friendIds: string[],
  note: string
): Promise<{ ok: boolean; sent: number }> {
  if (friendIds.length === 0) return { ok: false, sent: 0 };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, sent: 0 };

  const { data, error } = await supabase.rpc("send_event_to_friends", {
    p_event_id: eventId,
    p_friend_ids: friendIds.slice(0, 50),
    p_note: note.trim().slice(0, 140) || null,
  });
  if (error) {
    console.error("sendEventToFriends failed:", error);
    return { ok: false, sent: 0 };
  }
  const sent = typeof data === "number" ? data : 0;
  return { ok: sent > 0, sent };
}

export async function offerTicketToFriend(
  friendId: string,
  token: string
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { data, error } = await supabase.rpc("offer_ticket_to_friend", {
    p_friend_id: friendId,
    p_token: token,
  });
  if (error) {
    console.error("offerTicketToFriend failed:", error);
    return { ok: false };
  }
  if (data) revalidatePath("/saved");
  return { ok: Boolean(data) };
}
