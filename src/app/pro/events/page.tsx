import Link from "next/link";
import { fetchProEvents, proClient, requirePro } from "@/lib/supabase/pro-queries";
import { dateLocale } from "@/lib/dates";
import type { Locale } from "@/lib/i18n/config";

function euros(amount: number): string {
  return `€${amount.toFixed(2)}`;
}

function dateLabel(date: string, locale: Locale): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(dateLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function StatusPill({ label, tone }: { label: string; tone: "live" | "muted" | "danger" }) {
  const classes =
    tone === "live"
      ? "bg-accent/15 text-accent"
      : tone === "danger"
        ? "bg-danger/15 text-danger"
        : "bg-muted/15 text-muted";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-heading ${classes}`}>{label}</span>
  );
}

export default async function ProEventsPage({ searchParams }: PageProps<"/pro/events">) {
  const { account, locale, t } = await requirePro();
  const events = await fetchProEvents(proClient(), account);

  // A partial success on the form (show saved, genres or tags failed) redirects
  // here rather than stranding the organiser on a form for a show that already
  // exists - so the thing that went wrong has to be visible on arrival.
  const { warning } = await searchParams;

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = events.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = events.filter((e) => e.date < today);

  const sections = [
    { title: t("pro.upcoming"), rows: upcoming },
    { title: t("pro.past"), rows: past },
  ].filter((s) => s.rows.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl text-foreground">{t("pro.navEvents")}</h1>
          <p className="text-sm text-muted">
            {account.type === "venue"
              ? t("pro.eventsSubtitleVenue")
              : t("pro.eventsSubtitlePromoter")}
          </p>
        </div>
        <Link
          href="/pro/events/new"
          className="shrink-0 rounded-full bg-primary px-5 py-2.5 font-heading text-sm text-foreground"
        >
          {t("pro.newShow")}
        </Link>
      </div>

      {typeof warning === "string" && warning && (
        <p className="rounded-2xl bg-primary/10 px-4 py-3 text-sm text-primary">{warning}</p>
      )}

      {events.length === 0 ? (
        <div className="rounded-2xl bg-surface p-8 text-center">
          <p className="font-heading text-foreground">{t("pro.noShowsTitle")}</p>
          <p className="mt-1 text-sm text-muted">
            {t("pro.noShowsBody")}
          </p>
          <Link
            href="/pro/events/new"
            className="mt-4 inline-block rounded-full bg-primary px-5 py-2.5 font-heading text-sm text-foreground"
          >
            {t("pro.newShow")}
          </Link>
        </div>
      ) : (
        sections.map((section) => (
          <div key={section.title} className="rounded-2xl bg-surface p-5">
            <h2 className="mb-4 font-heading text-lg text-foreground">{section.title}</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-muted/15 text-muted">
                    <th className="pb-2 font-heading">{t("pro.colShow")}</th>
                    <th className="pb-2 font-heading">{t("pro.colDate")}</th>
                    <th className="pb-2 font-heading">{t("pro.colVenue")}</th>
                    <th className="pb-2 text-right font-heading">{t("pro.colSold")}</th>
                    <th className="pb-2 text-right font-heading">{t("pro.colTakings")}</th>
                    <th className="pb-2 text-right font-heading">{t("pro.colStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((event) => (
                    <tr key={event.id} className="border-b border-muted/10 last:border-0">
                      <td className="py-3 pr-3">
                        {event.owned ? (
                          <Link href={`/pro/events/${event.id}`} className="text-foreground hover:text-primary">
                            {event.title}
                          </Link>
                        ) : (
                          <span className="text-foreground">{event.title}</span>
                        )}
                        <span className="block text-xs text-muted">{event.artist}</span>
                      </td>
                      <td className="py-3 pr-3 text-muted">
                        {dateLabel(event.date, locale)}
                        <span className="block text-xs">{event.time?.slice(0, 5)}</span>
                      </td>
                      <td className="py-3 pr-3 text-muted">{event.venue}</td>
                      <td className="py-3 pr-3 text-right tabular-nums text-foreground">
                        {event.sold}
                        <span className="text-muted">/{event.capacity}</span>
                      </td>
                      {/* A dash, not a zero: the venue rule is "you can see the
                          diary, not other people's money", and a 0 would read
                          as "this show sold nothing". */}
                      <td className="py-3 pr-3 text-right tabular-nums text-foreground">
                        {event.revenue === null ? (
                          <span className="text-muted" title={t("pro.bookedBySomeoneElse")}>
                            —
                          </span>
                        ) : (
                          euros(event.revenue)
                        )}
                      </td>
                      <td className="py-3 text-right">
                        {event.cancelled ? (
                          <StatusPill label={t("pro.statusCancelled")} tone="danger" />
                        ) : !event.active ? (
                          <StatusPill label={t("pro.statusHidden")} tone="muted" />
                        ) : !event.owned ? (
                          <StatusPill label={t("pro.statusHosted")} tone="muted" />
                        ) : event.external ? (
                          <StatusPill label={t("pro.statusExternal")} tone="muted" />
                        ) : (
                          <StatusPill label={t("pro.statusOnSale")} tone="live" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
