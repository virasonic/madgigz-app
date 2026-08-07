"use client";

import { useEffect, useMemo, useState } from "react";
import EventCard from "@/components/feed/EventCard";
import TicketModal from "@/components/feed/TicketModal";
import { getAllEvents } from "@/lib/artist-data";
import { EventItem } from "@/lib/mock-data";
import { getSavedEventIds, toggleSaved } from "@/lib/session";

export default function ExplorePage() {
  const [allEvents, setAllEvents] = useState<EventItem[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [activeEvent, setActiveEvent] = useState<EventItem | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot read of browser-only storage on mount
    setAllEvents(getAllEvents());
    setSavedIds(getSavedEventIds());
  }, []);

  const filteredEvents = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allEvents;
    return allEvents.filter((event) =>
      [event.title, event.artist, event.venue, event.category]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [allEvents, query]);

  return (
    <div className="p-4">
      <h1 className="font-display mb-4 text-2xl text-foreground">Explore</h1>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search events, artists, venues..."
        className="mb-4 w-full rounded-2xl border border-muted/20 bg-surface px-4 py-3 text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
      />

      {filteredEvents.length === 0 ? (
        <p className="text-sm text-muted">No events found.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filteredEvents.map((event) => (
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
      )}

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
