"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Removes a refunded ticket from the caller's own Tickets list. This is a
// per-user hide, not a delete - the row is the record of money that moved
// and admin billing/event-detail reporting already depends on it existing.
// Uses the admin client rather than a client-writable RLS policy so a fan
// can't PATCH any other column on the row (refunded, checked_in_at) via a
// raw request - ownership and refunded-status are checked here instead.
export async function hideRefundedTicket(ticketId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  const admin = createAdminClient();
  const { data: ticket } = await admin
    .from("tickets")
    .select("id, user_id, refunded")
    .eq("id", ticketId)
    .single();

  if (!ticket) return { error: "Ticket not found" };
  if (ticket.user_id !== user.id) return { error: "Not your ticket" };
  if (!ticket.refunded) return { error: "Only refunded tickets can be removed" };

  const { error } = await admin
    .from("tickets")
    .update({ hidden_at: new Date().toISOString() })
    .eq("id", ticketId);

  if (error) {
    console.error("hideRefundedTicket failed:", error);
    return { error: "Couldn't remove that ticket. Please try again." };
  }

  revalidatePath("/saved");
  return { error: null };
}
