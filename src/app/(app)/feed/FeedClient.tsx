"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import TicketModal from "@/components/feed/TicketModal";
import EventCard from "@/components/feed/EventCard";
import ContentReelCard from "@/components/feed/ContentReelCard";
import AddContentModal from "@/components/artist/AddContentModal";
import { createClient } from "@/lib/supabase/client";
import { fetchContentPosts, toggleSavedEvent } from "@/lib/supabase/queries";
import { AppUser, ContentPost, EventItem } from "@/lib/types";

type Pane = "forYou" | "thisWeek";

type FeedEntry =
  | { kind: "event"; event: EventItem }
  | { kind: "post"; post: ContentPost; event: EventItem };

function buildForYouFeed(allEvents: EventItem[], allPosts: ContentPost[]): FeedEntry[] {
  const entries: FeedEntry[] = [];
  let postIndex = 0;

  allEvents.forEach((event, i) => {
    entries.push({ kind: "event", event });

    if ((i + 1) % 2 === 0 && postIndex < allPosts.length) {
      const post = allPosts[postIndex];
      const postEvent = allEvents.find((e) => e.id === post.eventId) ?? event;
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
        timeZone: "UTC",
      });
      const existing = groups.get(key) ?? [];
      existing.push(event);
      groups.set(key, existing);
    });
  return Array.from(groups.entries());
}

// Computed once at module load rather than during render, per React's purity rules.
const NOW = Date.now();
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function withinNextWeek(items: EventItem[]) {
  return items.filter((event) => {
    const eventTime = new Date(event.date).getTime();
    return eventTime >= NOW && eventTime <= NOW + WEEK_MS;
  });
}

interface FeedClientProps {
  user: AppUser;
  initialEvents: EventItem[];
  initialPosts: ContentPost[];
  initialSavedIds: string[];
  shows: EventItem[];
}

export default function FeedClient({
  user,
  initialEvents,
  initialPosts,
  initialSavedIds,
  shows,
}: FeedClientProps) {
  const [pane, setPane] = useState<Pane>("forYou");
  const [savedIds, setSavedIds] = useState<string[]>(initialSavedIds);
  const [allPosts, setAllPosts] = useState<ContentPost[]>(initialPosts);
  const [activeEvent, setActiveEvent] = useState<EventItem | null>(null);
  const [addContentOpen, setAddContentOpen] = useState(false);
  // Browsers block autoplay-with-sound, so reels start muted like TikTok/Reels;
  // shared (not per-card) so unmuting once stays unmuted as you scroll.
  const [reelsMuted, setReelsMuted] = useState(true);

  const forYouFeed = useMemo(
    () => buildForYouFeed(initialEvents, allPosts),
    [initialEvents, allPosts]
  );
  const weeklyGroups = useMemo(
    () => groupByDay(withinNextWeek(initialEvents)),
    [initialEvents]
  );

  async function handleToggleSave(eventId: string) {
    const wasSaved = savedIds.includes(eventId);
    setSavedIds((ids) => (wasSaved ? ids.filter((id) => id !== eventId) : [...ids, eventId]));
    const supabase = createClient();
    await toggleSavedEvent(supabase, user.id, eventId, wasSaved);
  }

  async function refreshContent() {
    const supabase = createClient();
    setAllPosts(await fetchContentPosts(supabase));
  }

  const artistName = user.artistName ?? user.username;

  return (
    <div className="relative flex h-full flex-col">
      <div className="relative flex justify-center gap-2 p-4">
        {user.role === "artist" && (
          <button
            type="button"
            onClick={() => setAddContentOpen(true)}
            aria-label="Post an update"
            className="absolute right-4 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-lg text-foreground"
          >
            +
          </button>
        )}
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
                    muted={reelsMuted}
                    onToggleMute={() => setReelsMuted((v) => !v)}
                    onOpen={() => setActiveEvent(entry.event)}
                  />
                </div>
              )
            )}
          </div>
        ) : (
          <div className="h-full overflow-y-auto px-4 pb-6">
            {weeklyGroups.length === 0 ? (
              <p className="mt-6 text-center text-sm text-muted">
                Nothing happening in the next 7 days.
              </p>
            ) : (
              weeklyGroups.map(([day, dayEvents]) => (
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
                          <Image
                            src={event.image}
                            alt={event.title}
                            fill
                            className="object-cover"
                          />
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
              ))
            )}
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

      {addContentOpen && (
        <AddContentModal
          shows={shows}
          artistName={artistName}
          onClose={() => setAddContentOpen(false)}
          onPosted={refreshContent}
        />
      )}
    </div>
  );
}
