import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  fetchCurrentUser,
  fetchEvents,
  fetchPendingTransfers,
  fetchSavedEventIds,
  fetchTickets,
} from "@/lib/supabase/queries";
import { isAppleWalletConfigured } from "@/lib/apple-wallet-config";
import SavedClient from "./SavedClient";

export default async function SavedPage() {
  const supabase = await createClient();
  const user = await fetchCurrentUser(supabase);
  if (!user) redirect("/");

  const [events, savedIds, tickets, pendingTransfers] = await Promise.all([
    fetchEvents(supabase),
    fetchSavedEventIds(supabase, user.id),
    fetchTickets(supabase, user.id),
    fetchPendingTransfers(supabase),
  ]);

  return (
    <SavedClient
      userId={user.id}
      initialEvents={events}
      initialSavedIds={savedIds}
      initialTickets={tickets}
      initialPendingTransfers={pendingTransfers}
      appleWalletEnabled={isAppleWalletConfigured()}
    />
  );
}
