import Link from "next/link";
import EventForm from "@/components/organiser/EventForm";
import { fetchApprovedArtists, fetchGenres, fetchVenues } from "@/lib/supabase/queries";
import { proClient, requirePro } from "@/lib/supabase/pro-queries";

export default async function ProNewEventPage() {
  const { account, t } = await requirePro();
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
          &larr; {t("pro.navEvents")}
        </Link>
        <h1 className="font-display mt-2 text-2xl text-foreground">{t("pro.newShow")}</h1>
        <p className="text-sm text-muted">
          {t("pro.newShowBlurb")}
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
