"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import EventCard from "@/components/feed/EventCard";
import TicketModal from "@/components/feed/TicketModal";
import Avatar from "@/components/ui/Avatar";
import { createClient } from "@/lib/supabase/client";
import { toggleSavedEvent } from "@/lib/supabase/queries";
import { EventItem, PublicArtistProfile } from "@/lib/types";

interface ExploreClientProps {
  userId: string;
  initialEvents: EventItem[];
  initialSavedIds: string[];
  artists: PublicArtistProfile[];
}

export default function ExploreClient({
  userId,
  initialEvents,
  initialSavedIds,
  artists,
}: ExploreClientProps) {
  const [savedIds, setSavedIds] = useState<string[]>(initialSavedIds);
  const [activeEvent, setActiveEvent] = useState<EventItem | null>(null);
  const [query, setQuery] = useState("");

  const trimmedQuery = query.trim().toLowerCase();

  const filteredEvents = useMemo(() => {
    if (!trimmedQuery) return initialEvents;
    return initialEvents.filter((event) =>
      [event.title, event.artist, event.venue, event.category]
        .join(" ")
        .toLowerCase()
        .includes(trimmedQuery)
    );
  }, [initialEvents, trimmedQuery]);

  // Artists only appear once someone searches - listing every artist above the
  // grid by default would bury the shows Explore exists to surface.
  const filteredArtists = useMemo(() => {
    if (!trimmedQuery) return [];
    return artists.filter((artist) =>
      [artist.artistName, artist.username].join(" ").toLowerCase().includes(trimmedQuery)
    );
  }, [artists, trimmedQuery]);

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

      {filteredArtists.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 font-heading text-sm uppercase tracking-wide text-muted">Artists</h2>
          <div className="flex flex-col gap-2">
            {filteredArtists.map((artist) => (
              <Link
                key={artist.id}
                href={`/profile/${artist.id}`}
                className="flex items-center gap-3 rounded-2xl bg-surface p-3"
              >
                <Avatar photoUrl={artist.artistPhotoUrl} name={artist.artistName} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-heading text-sm text-foreground">
                    {artist.artistName}
                  </p>
                  {/* artistName falls back to username when an artist never set
                      one, so without this the same string renders twice. */}
                  {artist.artistName !== artist.username && (
                    <p className="truncate text-xs text-muted">@{artist.username}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {filteredEvents.length > 0 && (
        <>
          {filteredArtists.length > 0 && (
            <h2 className="mb-3 font-heading text-sm uppercase tracking-wide text-muted">Events</h2>
          )}
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
        </>
      )}

      {filteredEvents.length === 0 && filteredArtists.length === 0 && (
        <p className="text-sm text-muted">
          {trimmedQuery ? "No events or artists found." : "No events found."}
        </p>
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
