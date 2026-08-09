import Link from "next/link";
import { notFound } from "next/navigation";
import { adminClient, requireAdmin } from "@/lib/supabase/admin-queries";
import {
  fetchApprovedArtists,
  fetchEventById,
  fetchEventGenreIds,
  fetchGenres,
  fetchTaggedArtistIds,
  fetchVenues,
} from "@/lib/supabase/queries";
import NewEventForm from "../../new/NewEventForm";

// Editing a MadGigz-created show. An artist's own show is deliberately not
// editable here - it belongs to their Manage Show sheet, where the fee split
// they were shown when publishing still applies.
export default async function AdminEditEventPage({ params }: PageProps<"/admin/events/[eventId]">) {
  await requireAdmin();
  const { eventId } = await params;
  const admin = adminClient();

  const event = await fetchEventById(admin, eventId);
  if (!event) notFound();

  const [venues, genres, artists, genreIds, taggedArtistIds] = await Promise.all([
    fetchVenues(admin),
    fetchGenres(admin),
    fetchApprovedArtists(admin),
    fetchEventGenreIds(admin, eventId),
    fetchTaggedArtistIds(admin, eventId),
  ]);

  const artistOwned = Boolean(event.artistId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/events" className="text-sm text-accent">
          &larr; Events
        </Link>
        <h1 className="font-display mt-2 text-2xl text-foreground">Edit show</h1>
        <p className="text-sm text-muted">{event.title}</p>
      </div>

      {artistOwned ? (
        <div className="rounded-2xl bg-surface p-5">
          <p className="font-heading text-sm text-foreground">This show belongs to an artist</p>
          <p className="mt-1 text-sm text-muted">
            {event.artist} publishes and manages it from their own profile, where the fee
            split they agreed to still applies. Cancelling it (which refunds everyone) is
            still available from the events list.
          </p>
        </div>
      ) : event.cancelled ? (
        <div className="rounded-2xl bg-surface p-5">
          <p className="font-heading text-sm text-foreground">This show is cancelled</p>
          <p className="mt-1 text-sm text-muted">
            Cancelled shows can&apos;t be edited — everyone has been refunded and the
            record stays as it was.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-surface p-5">
          <NewEventForm
            venues={venues}
            genres={genres}
            artists={artists}
            existing={event}
            genreIds={genreIds}
            taggedArtistIds={taggedArtistIds}
          />
        </div>
      )}
    </div>
  );
}
