import { adminClient, fetchAllEventsAdmin, requireAdmin } from "@/lib/supabase/admin-queries";
import EventsTable from "./EventsTable";

export default async function AdminEventsPage() {
  await requireAdmin();
  const admin = adminClient();
  const events = await fetchAllEventsAdmin(admin);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-foreground">Events</h1>
        <p className="text-sm text-muted">{events.length} events. Hiding an event removes it from Feed/Explore without deleting it.</p>
      </div>
      <div className="rounded-2xl bg-surface p-5">
        <EventsTable events={events} />
      </div>
    </div>
  );
}
