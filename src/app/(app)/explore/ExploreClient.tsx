"use client";

import { useMemo, useState } from "react";
import EventCard from "@/components/feed/EventCard";
import TicketModal from "@/components/feed/TicketModal";
import { createClient } from "@/lib/supabase/client";
import { toggleSavedEvent } from "@/lib/supabase/queries";
import { EventItem } from "@/lib/types";

interface ExploreClientProps {
  userId: string;
  initialEvents: EventItem[];
  initialSavedIds: string[];
}

export default function ExploreClient({
  userId,
  initialEvents,
  initialSavedIds,
}: ExploreClientProps) {
  const [savedIds, setSavedIds] = useState<string[]>(initialSavedIds);
  const [activeEvent, setActiveEvent] = useState<EventItem | null>(null);
  const [query, setQuery] = useState("");

  const filteredEvents = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return initialEvents;
    return initialEvents.filter((event) =>
      [event.title, event.artist, event.venue, event.category]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [initialEvents, query]);

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
              onToggleSave={() => handleToggleSave(event.id)}
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
