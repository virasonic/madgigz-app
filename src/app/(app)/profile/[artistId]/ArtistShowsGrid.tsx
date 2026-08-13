"use client";

import { useMemo, useState } from "react";
import EventCard from "@/components/feed/EventCard";
import TicketModal from "@/components/feed/TicketModal";
import { createClient } from "@/lib/supabase/client";
import { toggleSavedEvent } from "@/lib/supabase/queries";
import { EventItem } from "@/lib/types";
import { useUrlModal } from "@/lib/useUrlModal";
import { useT } from "@/lib/i18n/LocaleProvider";

export default function ArtistShowsGrid({
  userId,
  upcoming,
  past,
  initialSavedIds,
}: {
  userId: string;
  upcoming: EventItem[];
  past: EventItem[];
  initialSavedIds: string[];
}) {
  const { t } = useT();
  const [savedIds, setSavedIds] = useState<string[]>(initialSavedIds);
  // #102: open ticket sheet is ?ticket=<id>, resolved from this artist's shows.
  const ticketModal = useUrlModal("ticket");
  const allShows = useMemo(() => [...upcoming, ...past], [upcoming, past]);
  const activeEvent = useMemo(
    () => allShows.find((s) => s.id === ticketModal.value) ?? null,
    [allShows, ticketModal.value]
  );

  async function handleToggleSave(eventId: string) {
    const wasSaved = savedIds.includes(eventId);
    setSavedIds((ids) => (wasSaved ? ids.filter((id) => id !== eventId) : [...ids, eventId]));
    const supabase = createClient();
    const ok = await toggleSavedEvent(supabase, userId, eventId, wasSaved);
    if (!ok) {
      setSavedIds((ids) => (wasSaved ? [...ids, eventId] : ids.filter((id) => id !== eventId)));
    }
  }

  return (
    <>
      <h2 className="mb-3 mt-8 font-heading text-sm uppercase tracking-wide text-muted">
        {t("profile.upcomingShows")}
      </h2>
      {upcoming.length === 0 ? (
        <p className="text-sm text-muted">{t("profile.noUpcomingShows")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {upcoming.map((show) => (
            <EventCard key={show.id} event={show} onOpen={() => ticketModal.open(show.id)} />
          ))}
        </div>
      )}

      {/* Past shows kept separate (#141): a fan browsing an artist wants to see
          what's coming up first, with the back catalogue below rather than mixed
          into "upcoming". */}
      {past.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 font-heading text-sm uppercase tracking-wide text-muted">
            {t("profile.pastShows")}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {past.map((show) => (
              <EventCard key={show.id} event={show} onOpen={() => ticketModal.open(show.id)} />
            ))}
          </div>
        </>
      )}

      {activeEvent && (
        <TicketModal
          key={activeEvent.id}
          event={activeEvent}
          liked={savedIds.includes(activeEvent.id)}
          onToggleLike={() => handleToggleSave(activeEvent.id)}
          onClose={ticketModal.close}
        />
      )}
    </>
  );
}
