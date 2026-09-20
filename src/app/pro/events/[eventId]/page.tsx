import Link from "next/link";
import { notFound } from "next/navigation";
import EventForm from "@/components/organiser/EventForm";
import {
  fetchApprovedArtists,
  fetchEventGenreIds,
  fetchGenres,
  fetchTaggedArtistIds,
  fetchVenues,
} from "@/lib/supabase/queries";
import { fetchProEventForEdit, proClient, requirePro } from "@/lib/supabase/pro-queries";
import ShowVisibility from "./ShowVisibility";

export default async function ProEditEventPage({ params }: PageProps<"/pro/events/[eventId]">) {
  const { account } = await requirePro();
  const { eventId } = await params;
  const admin = proClient();

  // Returns null for a show this account doesn't own - including one a venue
  // can see in its own room but didn't book. 404, not 403: "you may not see
  // this" and "it isn't there" should read the same to someone trying ids.
  const event = await fetchProEventForEdit(admin, account, eventId);
  if (!event) notFound();

  const [venues, genres, artists, genreIds, taggedArtistIds] = await Promise.all([
    fetchVenues(admin),
    fetchGenres(admin),
    fetchApprovedArtists(admin),
    fetchEventGenreIds(admin, eventId),
    fetchTaggedArtistIds(admin, eventId),
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
        <h1 className="font-display mt-2 text-2xl text-foreground">Edit show</h1>
        <p className="text-sm text-muted">
          {event.title} · {event.sold} of {event.capacity} sold
        </p>
      </div>

      {event.cancelled ? (
        <div className="rounded-2xl bg-surface p-5">
          <p className="font-heading text-sm text-foreground">This show is cancelled</p>
          <p className="mt-1 text-sm text-muted">
            Everyone has been refunded and the record stays as it was, so it can&apos;t be edited.
          </p>
        </div>
      ) : (
        <>
          <ShowVisibility eventId={event.id} active={event.active} />
          <div className="rounded-2xl bg-surface p-5">
            <EventForm
              mode="pro"
              venues={venues}
              genres={genres}
              artists={artists}
              existing={event}
              genreIds={genreIds}
              taggedArtistIds={taggedArtistIds}
              lockedVenue={lockedVenue ? { id: lockedVenue.id, name: lockedVenue.name } : null}
            />
          </div>

          {/* Cancelling refunds real money to real people, so it stays a
              MadGigz action rather than a button in a panel someone might press
              to mean "hide it". */}
          <p className="text-sm text-muted">
            Need to cancel the show and refund everyone? Email MadGigz and we&apos;ll do it — it
            can&apos;t be undone, so it isn&apos;t a button here.
          </p>
        </>
      )}
    </div>
  );
}
