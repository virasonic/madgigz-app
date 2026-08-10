"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import TicketModal from "@/components/feed/TicketModal";
import ContentReelCard from "@/components/feed/ContentReelCard";
import AnnouncementCard from "@/components/feed/AnnouncementCard";
import AddContentModal from "@/components/artist/AddContentModal";
import { createClient } from "@/lib/supabase/client";
import { fetchContentPosts, toggleSavedEvent } from "@/lib/supabase/queries";
import { AppUser, ContentPost, EventItem } from "@/lib/types";
import { canActAsArtist } from "@/lib/roles";
import { getSeenAnnouncements, markAnnouncementSeen } from "@/lib/seen-announcements";

type Pane = "forYou" | "thisWeek";

interface FeedEntry {
  post: ContentPost;
  /** Null for a MadGigz announcement - see addendum_028. */
  event: EventItem | null;
}

// One announcement every this-many reels. Frequent enough that a new signup
// meets one early, rare enough that the feed still belongs to the artists.
const ANNOUNCEMENT_EVERY = 4;

// ...but never fewer than this, or a feed with almost no artist content yet
// would say nothing at all to a brand-new account.
const MIN_ANNOUNCEMENTS = 2;

// For You is content-only (no bare event posters) - each entry is a content
// post paired with the show it's actually about. A post whose event isn't in
// allEvents (hidden or deleted) is dropped rather than shown with no event.
function buildForYouFeed(
  allEvents: EventItem[],
  allPosts: ContentPost[],
  followed: Set<string>,
  seenAnnouncements: Set<string>
): FeedEntry[] {
  // Reversed: the query hands everything back newest-first, which is right for
  // artist reels and exactly wrong for a numbered explainer set - it met people
  // with "3 of 3" and finished on "Welcome to MadGigz".
  const announcements = allPosts.filter((post) => !post.eventId).reverse();

  const entries = allPosts.flatMap((post) => {
    if (!post.eventId) return [];
    const event = allEvents.find((e) => e.id === post.eventId);
    return event ? [{ post, event }] : [];
  });

  // Followed artists first, newest-first within each half. A stable sort keeps
  // the created_at order the query already applied, so this only lifts the
  // followed ones rather than reshuffling everything.
  const sorted = entries.sort(
    (a, b) => Number(followed.has(b.event.id)) - Number(followed.has(a.event.id))
  );

  if (announcements.length === 0) return sorted;

  const unseen = announcements.filter((post) => !seenAnnouncements.has(post.id));
  const seen = announcements.filter((post) => seenAnnouncements.has(post.id));

  // How many of the set to show at all. Capped against the amount of real
  // content, because an account with two artist reels was getting ten
  // explainers in a row - a feed that is mostly the app talking about itself.
  // The rest surface on their own as artists post more.
  const budget = Math.min(
    unseen.length,
    Math.max(MIN_ANNOUNCEMENTS, Math.floor(sorted.length / ANNOUNCEMENT_EVERY))
  );

  return [
    // Unseen first. Someone new should meet "what this is" before scrolling
    // past three gigs and giving up on working it out.
    ...unseen.slice(0, budget).map((post) => ({ post, event: null })),
    // Then the gigs, which are the actual point of the app.
    ...sorted,
    // Already-read cards fall to the bottom rather than disappearing: still
    // reachable if someone wants to check how tickets work, never in the way.
    ...seen.map((post) => ({ post, event: null })),
  ];
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
  shows: EventItem[];
  initialSavedIds: string[];
  followedEventIds: string[];
}

export default function FeedClient({
  user,
  initialEvents,
  initialPosts,
  shows,
  initialSavedIds,
  followedEventIds,
}: FeedClientProps) {
  const [pane, setPane] = useState<Pane>("forYou");
  const [allPosts, setAllPosts] = useState<ContentPost[]>(initialPosts);
  const [activeEvent, setActiveEvent] = useState<EventItem | null>(null);
  const [addContentOpen, setAddContentOpen] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>(initialSavedIds);
  // Browsers block autoplay-with-sound, so reels start muted like TikTok/Reels;
  // shared (not per-card) so unmuting once stays unmuted as you scroll.
  const [reelsMuted, setReelsMuted] = useState(true);

  const followed = useMemo(() => new Set(followedEventIds), [followedEventIds]);

  // Read once, on mount, and never updated while the pane is open. That is
  // deliberate: marking a card seen must not re-order the list under the
  // finger of the person currently reading it. The new order applies next time
  // they open the feed.
  const [seenAnnouncements, setSeenAnnouncements] = useState<Set<string>>(new Set());
  useEffect(() => {
    // localStorage cannot be read during render: the server has no window, so
    // a lazy useState initialiser would return an empty set on the server and a
    // populated one on the client, and the feed would hydrate in a different
    // order than it rendered. Reading after mount is the correct shape here.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setSeenAnnouncements(new Set(getSeenAnnouncements()));
  }, []);

  const handleAnnouncementSeen = useCallback((id: string) => {
    markAnnouncementSeen(id);
  }, []);

  const forYouFeed = useMemo(
    () => buildForYouFeed(initialEvents, allPosts, followed, seenAnnouncements),
    [initialEvents, allPosts, followed, seenAnnouncements]
  );
  // groupByDay re-sorts by date, and Array.sort is stable, so pre-sorting
  // followed-first keeps the days in order while lifting followed artists
  // within each one. This Week is a schedule; it can't stop being chronological.
  const weeklyGroups = useMemo(
    () =>
      groupByDay(
        [...withinNextWeek(initialEvents)].sort(
          (a, b) => Number(followed.has(b.id)) - Number(followed.has(a.id))
        )
      ),
    [initialEvents, followed]
  );

  async function refreshContent() {
    const supabase = createClient();
    setAllPosts(await fetchContentPosts(supabase));
  }

  // Liking in the feed and saving from Explore/an artist's page are the same
  // underlying action (saved_events) - a heart tapped here shows up as a
  // liked event on the Tickets page, and vice versa, rather than being two
  // disconnected concepts.
  async function handleToggleLike(eventId: string) {
    const wasLiked = savedIds.includes(eventId);
    setSavedIds((ids) => (wasLiked ? ids.filter((id) => id !== eventId) : [...ids, eventId]));
    const supabase = createClient();
    const ok = await toggleSavedEvent(supabase, user.id, eventId, wasLiked);
    // Put the heart back if the write was refused, rather than leaving it
    // showing a like that doesn't exist.
    if (!ok) {
      setSavedIds((ids) => (wasLiked ? [...ids, eventId] : ids.filter((id) => id !== eventId)));
    }
  }

  const artistName = user.artistName ?? user.username;

  return (
    <div className="relative flex h-full flex-col">
      <div className="relative flex justify-center gap-2 p-4">
        {canActAsArtist(user) && (
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
          forYouFeed.length === 0 ? (
            <p className="mt-6 px-4 text-center text-sm text-muted">
              No content yet - check Explore for upcoming shows.
            </p>
          ) : (
            <div className="h-full snap-y snap-mandatory overflow-y-scroll">
              {forYouFeed.map((entry) => (
                <div key={entry.post.id} className="h-full w-full snap-start">
                  {entry.event ? (
                    <ContentReelCard
                      post={entry.post}
                      event={entry.event}
                      muted={reelsMuted}
                      onToggleMute={() => setReelsMuted((v) => !v)}
                      onOpen={() => setActiveEvent(entry.event!)}
                      liked={savedIds.includes(entry.event.id)}
                      onToggleLike={() => handleToggleLike(entry.event!.id)}
                    />
                  ) : (
                    <AnnouncementCard
                      post={entry.post}
                      muted={reelsMuted}
                      onToggleMute={() => setReelsMuted((v) => !v)}
                      onSeen={handleAnnouncementSeen}
                    />
                  )}
                </div>
              ))}
            </div>
          )
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
          liked={savedIds.includes(activeEvent.id)}
          onToggleLike={() => handleToggleLike(activeEvent.id)}
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
