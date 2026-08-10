import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchEventById, fetchEventGenreNames } from "@/lib/supabase/queries";
import { absoluteUrl, eventPath, mapsUrl } from "@/lib/site";
import PublicEventActions from "./PublicEventActions";
import { getServerT } from "@/lib/i18n/server";

// The one page in the app that a logged-out stranger is meant to see. Everything
// else redirects to "/" without a session; this is what a shared link opens, so
// it has to stand on its own - outside the (app) group, no bottom nav, no auth.
//
// The gate is on buying, not looking. Walling off the event itself would defeat
// the point of sharing: the person receiving the link has no account and no
// reason to make one until they can see what the gig actually is.

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export async function generateMetadata({
  params,
}: PageProps<"/e/[eventId]">): Promise<Metadata> {
  const { eventId } = await params;
  const supabase = await createClient();
  const event = await fetchEventById(supabase, eventId);

  if (!event || !event.active) {
    const { t } = await getServerT();
    return { title: t("eventPage.notFoundTitle") };
  }

  // This is the part that makes a link worth sending. Pasted into WhatsApp or
  // iMessage, what sells the gig is the poster and the line underneath it - a
  // bare URL converts nothing.
  const title = `${event.title} - ${event.artist}`;
  const description = `${event.venue}, Madrid · ${formatDate(event.date)} · ${event.time}`;
  const url = absoluteUrl(eventPath(event.id));

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      title,
      description,
      url,
      siteName: "MadGigz",
      images: event.image ? [{ url: event.image, alt: event.title }] : undefined,
    },
    twitter: {
      card: event.image ? "summary_large_image" : "summary",
      title,
      description,
      images: event.image ? [event.image] : undefined,
    },
  };
}

export default async function PublicEventPage({ params }: PageProps<"/e/[eventId]">) {
  const { eventId } = await params;
  const supabase = await createClient();

  const event = await fetchEventById(supabase, eventId);
  // A hidden show is hidden from everyone, link or no link. Cancelled shows
  // stay reachable on purpose - someone holding a ticket and a link deserves
  // to be told it's off, not shown a 404.
  if (!event || !event.active) notFound();

  const [genres, { data: auth }] = await Promise.all([
    fetchEventGenreNames(supabase, event.id),
    supabase.auth.getUser(),
  ]);
  const signedIn = Boolean(auth.user);
  const { t } = await getServerT();

  const soldOut = event.capacity - event.sold <= 0;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <header className="pt-safe-page flex items-center justify-between px-5 pb-4">
        <Link href="/" aria-label={t("eventPage.homeAria")}>
          <Image
            src="/logos/madgigz-wordmark.png"
            alt="MadGigz"
            width={280}
            height={89}
            className="w-28"
            priority
          />
        </Link>
        {!signedIn && (
          <Link href="/signin" className="font-heading text-sm text-accent">
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
          {formatDate(event.date)} · {t("eventPage.doors")} {event.doors}
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

        <PublicEventActions event={event} signedIn={signedIn} soldOut={soldOut} />

        {event.description && (
          <>
            <h2 className="mb-2 mt-8 font-heading text-sm uppercase tracking-wide text-muted">
              {t("eventPage.about")}
            </h2>
            <p className="text-sm leading-relaxed text-foreground/90">{event.description}</p>
          </>
        )}

        {event.lineup.length > 0 && (
          <>
            <h2 className="mb-2 mt-8 font-heading text-sm uppercase tracking-wide text-muted">
              {t("eventPage.lineup")}
            </h2>
            <ol className="flex flex-col gap-1 text-sm text-foreground/90">
              {event.lineup.map((act, index) => (
                <li key={act}>
                  {index + 1}. {act}
                  {index === 0 && <span className="ml-2 text-xs text-accent">{t("ticket.headliner")}</span>}
                </li>
              ))}
            </ol>
          </>
        )}

        <p className="mt-8 text-xs text-muted">{event.ageRestriction}</p>
      </div>
    </div>
  );
}
