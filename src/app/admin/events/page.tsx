import Link from "next/link";
import { adminClient, fetchAllEventsAdmin, requireAdmin } from "@/lib/supabase/admin-queries";
import EventsTable from "./EventsTable";

export default async function AdminEventsPage() {
  await requireAdmin();
  const admin = adminClient();
  const { events, interest } = await fetchAllEventsAdmin(admin);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-foreground">Events</h1>
          <p className="text-sm text-muted">{events.length} events. Hiding an event removes it from Feed/Explore without deleting it.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/admin/events/import"
            className="rounded-full bg-surface px-5 py-2.5 font-heading text-sm text-foreground ring-1 ring-muted/30"
          >
            Import gigs
          </Link>
          <Link
            href="/admin/events/new"
            className="rounded-full bg-primary px-5 py-2.5 font-heading text-sm text-foreground"
          >
            New show
          </Link>
        </div>
      </div>
      <div className="rounded-2xl bg-surface p-5">
        <EventsTable events={events} interest={interest} />
      </div>
    </div>
  );
}
