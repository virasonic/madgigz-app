import Link from "next/link";
import EventForm from "@/components/organiser/EventForm";
import { fetchApprovedArtists, fetchGenres, fetchVenues } from "@/lib/supabase/queries";
import { proClient, requirePro } from "@/lib/supabase/pro-queries";

export default async function ProNewEventPage() {
  const { account } = await requirePro();
  const admin = proClient();

  const [venues, genres, artists] = await Promise.all([
    fetchVenues(admin),
    fetchGenres(admin),
    fetchApprovedArtists(admin),
  ]);

  const lockedVenue =
    account.type === "venue" && account.venueId
      ? (venues.find((v) => v.id === account.venueId) ?? null)
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/pro/events" className="text-sm text-accent">
          &larr; Events
        </Link>
        <h1 className="font-display mt-2 text-2xl text-foreground">New show</h1>
        <p className="text-sm text-muted">
          It goes live in the MadGigz app as soon as you save. Acts already on MadGigz can be
          tagged in the line-up — the show then appears on their profile and they can post about
          it, while you stay the only one who manages it.
        </p>
      </div>

      <div className="rounded-2xl bg-surface p-5">
        <EventForm
          mode="pro"
          venues={venues}
          genres={genres}
          artists={artists}
          lockedVenue={lockedVenue ? { id: lockedVenue.id, name: lockedVenue.name } : null}
        />
      </div>
    </div>
  );
}
