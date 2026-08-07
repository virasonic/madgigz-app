"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import TicketModal from "@/components/feed/TicketModal";
import EventCard from "@/components/feed/EventCard";
import ContentReelCard from "@/components/feed/ContentReelCard";
import { contentPosts, EventItem, events } from "@/lib/mock-data";
import { getSavedEventIds, toggleSaved } from "@/lib/session";

type Pane = "forYou" | "thisWeek";

type FeedEntry =
  | { kind: "event"; event: EventItem }
  | { kind: "post"; post: (typeof contentPosts)[number]; event: EventItem };

function buildForYouFeed(): FeedEntry[] {
  const entries: FeedEntry[] = [];
  let postIndex = 0;

  events.forEach((event, i) => {
    entries.push({ kind: "event", event });

    if ((i + 1) % 2 === 0 && postIndex < contentPosts.length) {
      const post = contentPosts[postIndex];
      const postEvent = events.find((e) => e.id === post.eventId) ?? event;
      entries.push({ kind: "post", post, event: postEvent });
      postIndex += 1;
    }
  });

  return entries;
}

function groupByDay(items: EventItem[]) {
  const groups = new Map<string, EventItem[]>();
  [...items]
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((event) => {
      const key = new Date(event.date).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
      });
      const existing = groups.get(key) ?? [];
      existing.push(event);
      groups.set(key, existing);
    });
  return Array.from(groups.entries());
}

export default function FeedPage() {
  const [pane, setPane] = useState<Pane>("forYou");
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [activeEvent, setActiveEvent] = useState<EventItem | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot read of browser-only storage on mount
    setSavedIds(getSavedEventIds());
  }, []);

  const forYouFeed = useMemo(() => buildForYouFeed(), []);
  const weeklyGroups = useMemo(() => groupByDay(events), []);

  function handleToggleSave(eventId: string) {
    setSavedIds(toggleSaved(eventId));
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex justify-center gap-2 p-4">
        {(
          [
            ["forYou", "For You"],
            ["thisWeek", "This Week"],
          ] as [Pane, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setPane(value)}
            className={`rounded-full px-5 py-2 text-sm font-heading ${
              pane === value ? "bg-primary text-foreground" : "bg-surface text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1">
        {pane === "forYou" ? (
          <div className="h-full snap-y snap-mandatory overflow-y-scroll">
            {forYouFeed.map((entry) =>
              entry.kind === "event" ? (
                <div key={entry.event.id} className="h-full w-full snap-start">
                  <EventCard
                    event={entry.event}
                    saved={savedIds.includes(entry.event.id)}
                    onToggleSave={() => handleToggleSave(entry.event.id)}
                    onOpen={() => setActiveEvent(entry.event)}
                  />
                </div>
              ) : (
                <div key={entry.post.id} className="h-full w-full snap-start">
                  <ContentReelCard
                    post={entry.post}
                    event={entry.event}
                    onOpen={() => setActiveEvent(entry.event)}
                  />
                </div>
              )
            )}
          </div>
        ) : (
          <div className="h-full overflow-y-auto px-4 pb-6">
            {weeklyGroups.map(([day, dayEvents]) => (
              <div key={day} className="mb-6">
                <h3 className="mb-3 font-heading text-sm uppercase tracking-wide text-muted">
                  {day}
                </h3>
                <div className="flex flex-col gap-3">
                  {dayEvents.map((event) => (
                    <button
                      key={event.id}
                      onClick={() => setActiveEvent(event)}
                      className="flex items-center gap-3 rounded-2xl bg-surface p-3 text-left"
                    >
                      <div className="relative h-14 w-14 overflow-hidden rounded-xl">
                        <Image src={event.image} alt={event.title} fill className="object-cover" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-heading text-sm text-foreground">
                          {event.title}
                        </p>
                        <p className="truncate text-xs text-muted">
                          {event.venue} · {event.time}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className="rounded-full px-2.5 py-0.5 text-[10px] font-heading uppercase text-foreground"
                          style={{ backgroundColor: event.accentColor }}
                        >
                          {event.category}
                        </span>
                        <span className="text-xs text-muted">€{event.price}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
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
