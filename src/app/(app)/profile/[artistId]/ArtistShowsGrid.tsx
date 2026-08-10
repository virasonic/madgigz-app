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
  shows,
  initialSavedIds,
}: {
  userId: string;
  shows: EventItem[];
  initialSavedIds: string[];
}) {
  const { t } = useT();
  const [savedIds, setSavedIds] = useState<string[]>(initialSavedIds);
  // #102: open ticket sheet is ?ticket=<id>, resolved from this artist's shows.
  const ticketModal = useUrlModal("ticket");
  const activeEvent = useMemo(
    () => shows.find((s) => s.id === ticketModal.value) ?? null,
    [shows, ticketModal.value]
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

  if (shows.length === 0) {
    return <p className="text-sm text-muted">{t("profile.noUpcomingShows")}</p>;
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {shows.map((show) => (
          <EventCard
            key={show.id}
            event={show}
            onOpen={() => ticketModal.open(show.id)}
          />
        ))}
      </div>

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
