import type { Metadata } from "next";
import { Wordmark } from "@/components/ui/Wordmark";
import Image from "next/image";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchEventBySlug,
  fetchEventGenreNames,
  fetchIsManuallyAttended,
  fetchPublicOrganiser,
  fetchTaggedArtistProfiles,
} from "@/lib/supabase/queries";
import { buildLineupLinks, normName } from "@/lib/lineup-links";
import { absoluteUrl, mapsUrl } from "@/lib/site";
import { eventPath, parseEventPath } from "@/lib/event-url";
import type { EventItem } from "@/lib/types";
import PublicEventActions from "./PublicEventActions";
import AttendedToggle from "./AttendedToggle";
import FanPhotosSection from "@/components/fan-photos/FanPhotosSection";
import { fetchFanPhotosForEvent } from "@/lib/fan-photos";
import BackButton from "@/components/ui/BackButton";
import ClampText from "@/components/ui/ClampText";
import { getServerT } from "@/lib/i18n/server";
import { dateLocale } from "@/lib/dates";

// The one page in the app that a logged-out stranger is meant to see. Everything
// else redirects to "/" without a session; this is what a shared link opens, so
// it has to stand on its own - outside the (app) group, no bottom nav, no auth.
//
// The gate is on buying, not looking. Walling off the event itself would defeat
// the point of sharing: the person receiving the link has no account and no
// reason to make one until they can see what the gig actually is.
//
// The URL is /event/yyyy/mm/dd/<slug> (#236) - four explicit segments rather
// than a catch-all because Next refuses opengraph-image under a catch-all. The
// slug is what identifies the
// show; the date is there for the human reading the link. So the lookup is by
// slug alone, and a date that doesn't match the show's current date - it was
// rescheduled after the link went out - 301s to the right one rather than 404s.
// The old /e/<id> shape 301s here too (src/app/e/[eventId]/page.tsx).

type Params = PageProps<"/event/[year]/[month]/[day]/[slug]">["params"];
type SearchParams = PageProps<"/event/[year]/[month]/[day]/[slug]">["searchParams"];

/**
 * Resolve the show behind the path. Returns null for a malformed path or an
 * unknown slug; redirects (never returns) when the date in the URL is stale.
 * The query string survives the redirect: ?buy=1 opens the ticket sheet, and a
 * shared link with it on is the whole point of #102.
 */
async function resolveEvent(
  supabase: SupabaseClient,
  params: Params,
  searchParams?: SearchParams
): Promise<EventItem | null> {
  const { year, month, day, slug } = await params;
  const parts = [year, month, day, slug];
  const parsed = parseEventPath(parts);
  if (!parsed) return null;
  const event = await fetchEventBySlug(supabase, parsed.slug);
  if (!event) return null;
  const canonical = eventPath(event);
  if (canonical !== `/event/${parts.join("/")}`) {
    const query = searchParams ? queryString(await searchParams) : "";
    permanentRedirect(`${canonical}${query}`);
  }
  return event;
}

function queryString(sp: Record<string, string | string[] | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (Array.isArray(v)) v.forEach((x) => q.append(k, x));
    else if (v !== undefined) q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

function formatDate(iso: string, dl: string) {
  return new Date(iso).toLocaleDateString(dl, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export async function generateMetadata({
  params,
}: PageProps<"/event/[year]/[month]/[day]/[slug]">): Promise<Metadata> {
  const supabase = await createClient();
  // No searchParams here on purpose: a stale-date redirect from metadata would
  // drop the query, and the page body (which has it) redirects first anyway.
  const event = await resolveEvent(supabase, params);

  return eventMetadata(event);
}

/**
 * The link-preview metadata for a show, or the not-found title for a missing
 * or hidden one. Shared with the legacy /e/<id> route, which serves the page
 * itself until addendum_073 gives the show a slug (#236).
 */
export async function eventMetadata(event: EventItem | null): Promise<Metadata> {
  if (!event || !event.active) {
    const { t } = await getServerT();
    return { title: t("eventPage.notFoundTitle") };
  }

  const { t, locale } = await getServerT();
  // This is the part that makes a link worth sending. Pasted into WhatsApp or
  // iMessage, what sells the gig is the poster and the line underneath it - a
  // bare URL converts nothing. Title = the concert itself; the line under it
  // leads with the call to action, then the where/when (#feedback).
  const title = event.title;
  const description = `${t("eventPage.shareBuy")} · ${event.venue} · ${formatDate(event.date, dateLocale(locale))}`;
  const url = absoluteUrl(eventPath(event));

  return {
    title,
    description,
    alternates: { canonical: url },
    // og:image / twitter:image come from the generated card in
    // opengraph-image.tsx + twitter-image.tsx (#172) - don't also set images
    // here or the page emits two of each.
    openGraph: {
      type: "website",
      title,
      description,
      url,
      siteName: "MadGigz",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function PublicEventPage({
  params,
  searchParams,
}: PageProps<"/event/[year]/[month]/[day]/[slug]">) {
  const supabase = await createClient();

  const event = await resolveEvent(supabase, params, searchParams);
  // A hidden show is hidden from everyone, link or no link. Cancelled shows
  // stay reachable on purpose - someone holding a ticket and a link deserves
  // to be told it's off, not shown a 404.
  if (!event || !event.active) notFound();

  return <EventPageView event={event} supabase={supabase} />;
}

/**
 * The page itself, given a resolved, active show. Shared with the legacy
 * /e/<id> route (#236) so a link shared before the slug existed renders the
 * same page instead of a 404 while the SQL is still to be run.
 */
export async function EventPageView({
  event,
  supabase,
}: {
  event: EventItem;
  supabase: SupabaseClient;
}) {

  const [genres, { data: auth }, tagged] = await Promise.all([
    fetchEventGenreNames(supabase, event.id),
    supabase.auth.getUser(),
    fetchTaggedArtistProfiles(supabase, event.id),
  ]);
  const signedIn = Boolean(auth.user);
  const { t, locale } = await getServerT();

  // #116 manual attendance: a signed-in fan can mark a PAST show "I was there".
  const isPast = event.date < new Date().toISOString().slice(0, 10);
  const attendedThis =
    signedIn && isPast && auth.user
      ? await fetchIsManuallyAttended(supabase, auth.user.id, event.id)
      : false;

  // Fan photos (#195): everything this viewer may see on a past show (RLS
  // decides), plus whether they count as an attendee - a scanned-in ticket or
  // the manual mark - which is what gates adding their own.
  const [fanPhotos, scannedIn] = isPast
    ? await Promise.all([
        fetchFanPhotosForEvent(supabase, event.id),
        auth.user
          ? supabase
              .from("tickets")
              .select("id", { count: "exact", head: true })
              .eq("user_id", auth.user.id)
              .eq("event_id", event.id)
              .not("checked_in_at", "is", null)
              .then((r) => (r.count ?? 0) > 0)
          : Promise.resolve(false),
      ])
    : [[], false];
  const canAddPhotos = attendedThis || scannedIn;

  // Line-up act name -> profile id, for the ones that are tagged MadGigz artists
  // (or the owner). Non-matching acts stay plain text.
  const lineupLinks = buildLineupLinks(tagged, { id: event.artistId, name: event.artist });

  // The promoter or venue presenting this night. They are not on the line-up -
  // they didn't play - so they need their own credit, and it is the only route
  // a fan has to their profile and the follow button on it.
  const organiser = await fetchPublicOrganiser(supabase, event.proAccountId);

  const soldOut = event.capacity - event.sold <= 0;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <header className="pt-safe-page flex items-center gap-3 px-5 pb-4">
        {/* Signed-in fans reach this from a notification, Explore or a reel, so
            they need a way back (#feedback). A logged-out stranger arriving on a
            shared link has no in-app history — the wordmark home link is their
            affordance instead. */}
        {signedIn && <BackButton />}
        <Link href="/" aria-label={t("eventPage.homeAria")}>
          <Wordmark width={280} className="w-28" />
        </Link>
        {!signedIn && (
          <Link href="/signin" className="ml-auto font-heading text-sm text-accent">
            {t("common.signIn")}
          </Link>
        )}
      </header>

      <div className="px-5 pb-12">
        <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-surface">
          <Image
            src={event.image}
            alt={event.title}
            fill
            sizes="(max-width: 448px) 100vw, 448px"
            className="object-contain"
            priority
          />
        </div>

        {event.cancelled && (
          <p className="mt-4 rounded-xl bg-primary/10 px-4 py-3 font-heading text-sm text-primary">
            {t("eventPage.cancelledNotice")}
          </p>
        )}

        <h1 className="font-display mt-5 text-3xl text-foreground">{event.title}</h1>
        <p className="mt-1 text-base text-foreground/90">{event.artist}</p>
        <a
          href={mapsUrl(event.venue, event.venueAddress)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block text-sm text-accent"
        >
          {event.venue}
          {event.venueAddress ? ` · ${event.venueAddress}` : ` · ${event.city}`} &rarr;
        </a>
        <p className="text-sm text-muted">
          {formatDate(event.date, dateLocale(locale))} · {t("eventPage.doors")} {event.doors}
        </p>

        {genres.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {genres.map((genre) => (
              <span
                key={genre}
                className="rounded-full bg-surface px-3 py-1 text-xs font-heading uppercase tracking-wide text-muted"
              >
                {genre}
              </span>
            ))}
          </div>
        )}

        <p className="font-display mt-5 text-2xl text-foreground">
          {/* events.price is euros; pricing.ts's formatEuros takes cents, so
              it is the wrong tool here - it rendered a EUR14 gig as EUR0.14. */}
          {event.price === 0 ? t("eventPage.freeEntry") : `€${event.price.toFixed(2)}`}
        </p>

        <PublicEventActions event={event} signedIn={signedIn} soldOut={soldOut} isPast={isPast} />

        {signedIn && isPast && (
          <AttendedToggle eventId={event.id} initialAttended={attendedThis} />
        )}

        {isPast && (
          <FanPhotosSection
            eventId={event.id}
            photos={fanPhotos}
            userId={auth.user?.id ?? null}
            attended={canAddPhotos}
          />
        )}

        {event.description && (
          <>
            <h2 className="mb-2 mt-8 font-heading text-sm uppercase tracking-wide text-muted">
              {t("eventPage.about")}
            </h2>
            <ClampText
              text={event.description}
              lines={4}
              className="text-sm leading-relaxed text-foreground/90"
            />
          </>
        )}

        {event.lineup.length > 0 && (
          <>
            <h2 className="mb-2 mt-8 font-heading text-sm uppercase tracking-wide text-muted">
              {t("eventPage.lineup")}
            </h2>
            <ol className="flex flex-col gap-1 text-sm text-foreground/90">
              {event.lineup.map((act, index) => {
                const profileId = lineupLinks[normName(act)];
                return (
                  <li key={act}>
                    {index + 1}.{" "}
                    {profileId ? (
                      <Link href={`/profile/${profileId}`} className="text-accent hover:underline">
                        {act}
                      </Link>
                    ) : (
                      act
                    )}
                    {index === 0 && (
                      <span className="ml-2 text-xs text-accent">{t("ticket.headliner")}</span>
                    )}
                  </li>
                );
              })}
            </ol>
          </>
        )}

        {organiser && (
          <>
            <h2 className="mb-2 mt-8 font-heading text-sm uppercase tracking-wide text-muted">
              {t("eventPage.presentedBy")}
            </h2>
            <Link href={`/profile/${organiser.id}`} className="text-sm text-accent hover:underline">
              {organiser.name}
            </Link>
          </>
        )}

        <p className="mt-8 text-xs text-muted">{event.ageRestriction}</p>
      </div>
    </div>
  );
}
