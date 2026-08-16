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

  // Tier names for tickets bought at a specific type (#151), so a fan holding
  // "General" and "VIP" can tell them apart. event_tiers is world-readable.
  const tierIds = [...new Set(tickets.map((t) => t.tierId).filter((id): id is string => Boolean(id)))];
  let tierNames: Record<string, string> = {};
  if (tierIds.length > 0) {
    const { data } = await supabase.from("event_tiers").select("id, name").in("id", tierIds);
    tierNames = Object.fromEntries((data ?? []).map((r) => [r.id as string, r.name as string]));
  }

  return (
    <SavedClient
      userId={user.id}
      initialEvents={events}
      initialSavedIds={savedIds}
      initialTickets={tickets}
      initialPendingTransfers={pendingTransfers}
      tierNames={tierNames}
      appleWalletEnabled={isAppleWalletConfigured()}
    />
  );
}
