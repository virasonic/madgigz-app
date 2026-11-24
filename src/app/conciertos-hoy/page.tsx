import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/ui/Wordmark";
import { createClient } from "@/lib/supabase/server";
import { fetchEvents } from "@/lib/supabase/queries";
import { CURRENT_CITY } from "@/lib/city";
import { dateLocale, todayInMadrid } from "@/lib/dates";
import { eventPath } from "@/lib/event-url";
import { jsonLdScript } from "@/lib/event-jsonld";
import { clockTime, formatPrice } from "@/lib/event-seo";
import { getServerT } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/config";
import { absoluteUrl } from "@/lib/site";
import type { EventItem } from "@/lib/types";

// The page for the search nobody was finding us with: "conciertos Madrid hoy",
// "live music Madrid tonight" (#239, from Alex's traffic plan). Explore answers
// it too, but Explore is an app screen - cards, filters, a feed - and a search
// engine or an AI answer engine wants a page that literally says what's on
// tonight, as text, with a date on it saying when it was last true.
//
// So: plain text, every show tonight then the rest of the week, each line
// linking to the show's own page (where the MusicEvent markup lives). Public,
// guest-readable, outside the (app) group - no session, no bottom nav - and in
// the sitemap. It renders per request so the date in the heading is the date
// it is in Madrid right now, not the date of the last build.

export async function generateMetadata(): Promise<Metadata> {
  const { t, locale } = await getServerT();
  return {
    title: t("seo.todayTitle", { date: headingDate(todayInMadrid(), locale) }),
    description: t("seo.todayDescription"),
    alternates: { canonical: absoluteUrl("/conciertos-hoy") },
  };
}

// The page is dated by Madrid's calendar, so "today" rolls over at Madrid
// midnight - which is still yesterday in UTC for the first hour or two.
function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// "lunes, 24 de noviembre de 2026" / "Monday 24 November 2026" - the full form,
// because this page's whole claim is "this is what's on, on this date".
function headingDate(isoDate: string, locale: Locale): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(dateLocale(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// "mar 25 nov" for the per-day headers in the week list.
function dayLabel(isoDate: string, locale: Locale): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(dateLocale(locale), {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export default async function TodayPage() {
  const supabase = await createClient();
  const [{ t, locale }, events] = await Promise.all([
    getServerT(),
    // The same query Explore makes for a guest: active, upcoming, this city.
    // Cancelled shows are dropped here - a cancelled gig is not "what's on".
    fetchEvents(supabase, { activeOnly: true, city: CURRENT_CITY, upcomingOnly: true }),
  ]);

  const today = todayInMadrid();
  const weekEnd = addDays(today, 7);
  const live = events.filter((e) => !e.cancelled);
  const tonight = live.filter((e) => e.date === today);
  const week = live.filter((e) => e.date > today && e.date <= weekEnd);

  // Group the week by day so the list reads as a diary, not a jumble.
  const byDay = new Map<string, EventItem[]>();
  for (const e of week) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);

  // A schema.org ItemList of tonight's shows, each pointing at the page that
  // carries the full MusicEvent block. Tells a crawler this is a list page and
  // which pages it lists, without duplicating the event markup here.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: t("seo.todayTitle", { date: headingDate(today, locale) }),
    itemListElement: [...tonight, ...week].map((e, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: e.title,
      url: absoluteUrl(eventPath(e)),
    })),
  };

  return (
    <div className="pt-safe-page mx-auto flex min-h-screen w-full max-w-md flex-1 flex-col bg-background px-6 pb-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <header className="flex items-center justify-between py-2">
        <Link href="/" aria-label={t("eventPage.homeAria")}>
          <Wordmark width={160} className="w-28" />
        </Link>
        <Link href="/explore" className="font-heading text-sm text-accent">
          {t("today.browseAll")}
        </Link>
      </header>

      <main className="mt-6">
        <h1 className="font-display text-3xl leading-tight text-foreground">{t("today.heading")}</h1>
        {/* The "this is current" line: an answer engine quoting the page
            needs a date it can trust, so it is plain text, not a tooltip. */}
        <p className="mt-2 text-sm text-muted">{t("today.updated", { date: headingDate(today, locale) })}</p>
        <p className="mt-4 text-sm leading-relaxed text-foreground/80">{t("today.intro")}</p>

        <section className="mt-8">
          <h2 className="font-heading text-lg text-foreground">
            {t("today.tonight", { date: headingDate(today, locale) })}
          </h2>
          {tonight.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{t("today.nothingTonight")}</p>
          ) : (
            <ShowList events={tonight} locale={locale} t={t} />
          )}
        </section>

        <section className="mt-10">
          <h2 className="font-heading text-lg text-foreground">{t("today.thisWeek")}</h2>
          {week.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{t("today.nothingThisWeek")}</p>
          ) : (
            [...byDay.entries()].map(([date, shows]) => (
              <div key={date} className="mt-5">
                <h3 className="font-heading text-sm uppercase tracking-wide text-muted">
                  {dayLabel(date, locale)}
                </h3>
                <ShowList events={shows} locale={locale} t={t} />
              </div>
            ))
          )}
        </section>

        <p className="mt-12 text-center text-sm">
          <Link href="/explore" className="font-heading text-accent underline underline-offset-2">
            {t("today.browseAll")}
          </Link>
        </p>
      </main>
    </div>
  );
}

// One line per show, in reading order: time, who, where, price. Everything a
// "what's on tonight" answer needs is in the text of the line itself; the link
// is the whole line so it works as a list on a phone.
function ShowList({
  events,
  locale,
  t,
}: {
  events: EventItem[];
  locale: Locale;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  return (
    <ul className="mt-3 flex flex-col divide-y divide-foreground/10">
      {events.map((e) => (
        <li key={e.id}>
          <Link href={eventPath(e)} className="flex gap-4 py-3">
            <span className="w-12 shrink-0 font-heading text-sm text-accent">{clockTime(e.time)}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-heading text-base text-foreground">{e.title}</span>
              <span className="text-sm text-muted">
                {e.venue}
                {e.venueAddress ? ` · ${e.venueAddress}` : ""}
              </span>
            </span>
            <span className="shrink-0 text-sm text-foreground/80">
              {e.price > 0 ? t("today.from", { price: formatPrice(e.price, locale) }) : t("today.free")}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
