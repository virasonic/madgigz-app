"use client";

import { useEffect, useState } from "react";
import EventCard from "@/components/feed/EventCard";
import TicketModal from "@/components/feed/TicketModal";
import { EventItem, events } from "@/lib/mock-data";
import { getSavedEventIds, toggleSaved } from "@/lib/session";

export default function ExplorePage() {
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [activeEvent, setActiveEvent] = useState<EventItem | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot read of browser-only storage on mount
    setSavedIds(getSavedEventIds());
  }, []);

  return (
    <div className="p-4">
      <h1 className="font-display mb-4 text-2xl text-foreground">Explore</h1>
      <div className="grid grid-cols-2 gap-3">
        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            variant="grid"
            saved={savedIds.includes(event.id)}
            onToggleSave={() => setSavedIds(toggleSaved(event.id))}
            onOpen={() => setActiveEvent(event)}
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
    </div>
  );
}
