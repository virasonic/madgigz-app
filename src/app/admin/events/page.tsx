import Link from "next/link";
import { adminClient, fetchAllEventsAdmin, requireAdmin } from "@/lib/supabase/admin-queries";
import EventsTable from "./EventsTable";

export default async function AdminEventsPage({ searchParams }: PageProps<"/admin/events">) {
  await requireAdmin();
  const admin = adminClient();
  const { events, interest } = await fetchAllEventsAdmin(admin);

  // A partial success on the new-show form (show created, but ticket types,
  // genres or tags failed) redirects here rather than stranding the admin on a
  // form for a show that already exists - so the thing that went wrong has to be
  // visible on arrival. /pro/events has always shown this; /admin never read the
  // param, so a dropped set of ticket types arrived as a silently ordinary list.
  const { warning } = await searchParams;

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
      {typeof warning === "string" && warning && (
        <p className="rounded-2xl bg-primary/10 px-4 py-3 text-sm text-primary">{warning}</p>
      )}
      <div className="rounded-2xl bg-surface p-5">
        <EventsTable events={events} interest={interest} />
      </div>
    </div>
  );
}
