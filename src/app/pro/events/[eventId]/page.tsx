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
import TierManager, { type TierManagerTier } from "@/components/organiser/TierManager";

export default async function ProEditEventPage({ params }: PageProps<"/pro/events/[eventId]">) {
  const { account, t } = await requirePro();
  const { eventId } = await params;
  const admin = proClient();

  // Returns null for a show this account doesn't own - including one a venue
  // can see in its own room but didn't book. 404, not 403: "you may not see
  // this" and "it isn't there" should read the same to someone trying ids.
  const event = await fetchProEventForEdit(admin, account, eventId);
  if (!event) notFound();

  const [venues, genres, artists, genreIds, taggedArtistIds, { data: tierRows }] =
    await Promise.all([
      fetchVenues(admin),
      fetchGenres(admin),
      fetchApprovedArtists(admin),
      fetchEventGenreIds(admin, eventId),
      fetchTaggedArtistIds(admin, eventId),
      // Price tiers (#151). No rows - or no table, pre-addendum_039 - is an
      // empty editor to start filling in, not an error.
      admin
        .from("event_tiers")
        .select("id, name, price, capacity, max_per_order, available_until, sold")
        .eq("event_id", eventId)
        .order("sort_order", { ascending: true }),
    ]);

  const tiers: TierManagerTier[] = (tierRows ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    price: Number(r.price),
    capacity: r.capacity as number,
    maxPerOrder: (r.max_per_order as number | null) ?? 6,
    availableUntil: (r.available_until as string | null) ?? null,
    sold: r.sold as number,
  }));
  const isExternal = event.ticketing?.mode === "external";

  const lockedVenue =
    account.type === "venue" && account.venueId
      ? (venues.find((v) => v.id === account.venueId) ?? null)
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/pro/events" className="text-sm text-accent">
          &larr; {t("pro.navEvents")}
        </Link>
        <h1 className="font-display mt-2 text-2xl text-foreground">{t("pro.editShow")}</h1>
        <p className="text-sm text-muted">
          {event.title} · {t("pro.soldOfCapacity", { sold: event.sold, capacity: event.capacity })}
        </p>
      </div>

      {event.cancelled ? (
        <div className="rounded-2xl bg-surface p-5">
          <p className="font-heading text-sm text-foreground">{t("pro.showCancelledTitle")}</p>
          <p className="mt-1 text-sm text-muted">
            {t("pro.showCancelledBody")}
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

          {/* External-link shows sell somewhere else, so there are no ticket
              types of ours to price. */}
          {!isExternal && <TierManager mode="pro" eventId={event.id} initialTiers={tiers} />}

          {/* Cancelling refunds real money to real people, so it stays a
              MadGigz action rather than a button in a panel someone might press
              to mean "hide it". */}
          <p className="text-sm text-muted">
            {t("pro.cancelHint")}
          </p>
        </>
      )}
    </div>
  );
}
