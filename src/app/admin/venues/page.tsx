import { adminClient, fetchVenuesAdmin, requireAdmin } from "@/lib/supabase/admin-queries";
import VenuesTable from "./VenuesTable";

export default async function AdminVenuesPage() {
  await requireAdmin();
  const venues = await fetchVenuesAdmin(adminClient());
  const missingAddress = venues.filter((v) => v.active && !v.address).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-foreground">Venues</h1>
        <p className="text-sm text-muted">
          {venues.length} venues in Madrid.{" "}
          {missingAddress > 0
            ? `${missingAddress} still need an address - artists can add a venue by typing it, and it lands here for you to complete.`
            : "Every active venue has an address."}
        </p>
      </div>
      <div className="rounded-2xl bg-surface p-5">
        <VenuesTable venues={venues} />
      </div>
    </div>
  );
}
