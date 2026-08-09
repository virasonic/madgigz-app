"use client";

import { useState } from "react";
import EventCard from "@/components/feed/EventCard";
import TicketModal from "@/components/feed/TicketModal";
import { createClient } from "@/lib/supabase/client";
import { toggleSavedEvent } from "@/lib/supabase/queries";
import { EventItem } from "@/lib/types";

export default function ArtistShowsGrid({
  userId,
  shows,
  initialSavedIds,
}: {
  userId: string;
  shows: EventItem[];
  initialSavedIds: string[];
}) {
  const [savedIds, setSavedIds] = useState<string[]>(initialSavedIds);
  const [activeEvent, setActiveEvent] = useState<EventItem | null>(null);

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
    return <p className="text-sm text-muted">No upcoming shows right now.</p>;
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {shows.map((show) => (
          <EventCard
            key={show.id}
            event={show}
            variant="grid"
            saved={savedIds.includes(show.id)}
            onToggleSave={() => handleToggleSave(show.id)}
            onOpen={() => setActiveEvent(show)}
          />
        ))}
      </div>

      {activeEvent && (
        <TicketModal
          key={activeEvent.id}
          event={activeEvent}
          onClose={() => setActiveEvent(null)}
        />
      )}
    </>
  );
}
