"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FanPosterGrid } from "@/components/profile/FanPosterWall";
import PosterWallExportButton from "@/components/profile/PosterWallExportButton";
import { markAttended, markNotAttended } from "@/app/(app)/profile/attendance-actions";
import { useT } from "@/lib/i18n/LocaleProvider";
import { dateLocale } from "@/lib/dates";
import type { EventItem } from "@/lib/types";

// #230: the Recuerdos tab. The attended "memories" wall (#116) + the "Share my
// wall" export (#228), moved off the profile into their own bottom-nav tab, plus
// the "Were you there?" prompt that feeds the wall. Fan-only (the page guards
// the role); all data is the caller's own.

function formatDate(iso: string, dl: string) {
  return new Date(iso).toLocaleDateString(dl, { day: "numeric", month: "short", timeZone: "UTC" });
}

export default function RecuerdosClient({
  attendedEvents,
  attendanceCandidates,
}: {
  attendedEvents: EventItem[];
  attendanceCandidates: EventItem[];
}) {
  const { t, locale } = useT();
  const dl = dateLocale(locale);
  const router = useRouter();
  const [candidates, setCandidates] = useState<EventItem[]>(attendanceCandidates);
  const [markingId, setMarkingId] = useState<string | null>(null);

  async function handleWent(eventId: string) {
    setMarkingId(eventId);
    const { ok } = await markAttended(eventId);
    setMarkingId(null);
    if (!ok) return;
    // Drop it from the prompt and refresh so the wall picks it up.
    setCandidates((list) => list.filter((e) => e.id !== eventId));
    router.refresh();
  }

  async function handleDidntGo(eventId: string) {
    setMarkingId(eventId);
    const { ok } = await markNotAttended(eventId);
    setMarkingId(null);
    if (!ok) return;
    setCandidates((list) => list.filter((e) => e.id !== eventId));
  }

  return (
    <div className="p-4">
      <h1 className="mb-6 font-display text-2xl text-foreground">{t("nav.recuerdos")}</h1>

      {attendedEvents.length > 0 ? (
        <FanPosterGrid
          title={t("profile.pastShowsTitle")}
          subtitle={t("profile.pastShowsSubtitle")}
          events={attendedEvents}
          action={<PosterWallExportButton events={attendedEvents} />}
        />
      ) : (
        candidates.length === 0 && (
          <div className="mb-8 rounded-2xl bg-surface p-6 text-center">
            <p className="text-sm text-muted">{t("profile.recuerdosEmpty")}</p>
          </div>
        )
      )}

      {/* #116 manual attendance: past shows the fan saved but wasn't scanned in
          to. "Yes, I went" adds one to the wall above. */}
      {candidates.length > 0 && (
        <div className="mb-8">
          <h2 className="font-heading text-sm uppercase tracking-wide text-muted">
            {t("profile.wereYouThereTitle")}
          </h2>
          <p className="mt-1 text-xs text-muted">{t("profile.wereYouThereSubtitle")}</p>
          <div className="mt-3 flex flex-col gap-2">
            {candidates.map((event) => (
              <div key={event.id} className="flex items-center gap-3 rounded-2xl bg-surface p-2.5">
                <Link
                  href={`/e/${event.id}`}
                  className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-background"
                >
                  {event.image ? (
                    <Image src={event.image} alt={event.title} fill sizes="56px" className="object-cover" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center p-1 text-center font-heading text-[10px] text-muted">
                      {event.title}
                    </span>
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{event.title}</p>
                  <p className="truncate text-xs text-muted">{formatDate(event.date, dl)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleDidntGo(event.id)}
                    disabled={markingId === event.id}
                    className="rounded-full border border-muted/30 px-3 py-1.5 text-xs font-heading text-muted transition-colors hover:text-foreground disabled:opacity-50"
                  >
                    {t("profile.wereYouThereNo")}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleWent(event.id)}
                    disabled={markingId === event.id}
                    className="rounded-full bg-primary px-3 py-1.5 text-xs font-heading text-foreground disabled:opacity-50"
                  >
                    {markingId === event.id ? t("common.saving") : t("profile.wereYouThereYes")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
