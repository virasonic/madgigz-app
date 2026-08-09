import Link from "next/link";
import { adminClient, requireAdmin } from "@/lib/supabase/admin-queries";
import { fetchApprovedArtists, fetchGenres, fetchVenues } from "@/lib/supabase/queries";
import NewEventForm from "./NewEventForm";

// Shows MadGigz puts on the platform itself: a gig ticketed somewhere else that
// deserves to be discoverable here, or a night MadGigz runs directly.
export default async function AdminNewEventPage() {
  await requireAdmin();
  const admin = adminClient();

  const [venues, genres, artists] = await Promise.all([
    fetchVenues(admin),
    fetchGenres(admin),
    fetchApprovedArtists(admin),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/events" className="text-sm text-accent">
          &larr; Events
        </Link>
        <h1 className="font-display mt-2 text-2xl text-foreground">New show</h1>
        <p className="text-sm text-muted">
          For shows MadGigz lists on someone else&apos;s behalf, or runs itself. An
          artist&apos;s own shows still come from their profile.
        </p>
      </div>

      <div className="rounded-2xl bg-surface p-5">
        <NewEventForm venues={venues} genres={genres} artists={artists} />
      </div>
    </div>
  );
}
