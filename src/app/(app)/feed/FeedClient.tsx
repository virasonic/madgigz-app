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

// How many unseen announcements sit above the gigs. A few, so a new signup
// meets "what this is" straight away, but not so many that they scroll past a
// wall of the app before reaching any actual music. The rest are NOT hidden -
// they follow the reels, so the whole set is always reachable.
const TOP_UNSEEN = 3;

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
  const asEntry = (post: ContentPost): FeedEntry => ({ post, event: null });

  // Nothing is dropped: a few unseen cards lead, the gigs come next, then any
  // remaining unseen cards, then the ones already read. As artist content
  // grows the reels naturally push the trailing block further down, and read
  // cards drift to the very bottom on their own.
  return [
    ...unseen.slice(0, TOP_UNSEEN).map(asEntry),
    ...sorted,
    ...unseen.slice(TOP_UNSEEN).map(asEntry),
    ...seen.map(asEntry),
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
  const [announcementsOpen, setAnnouncementsOpen] = useState(false);
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

  // Oldest-first, the reading order of the intro set - the same order the feed
  // itself uses. Empty means the button hides rather than opening to nothing.
  const announcements = useMemo(
    () => allPosts.filter((post) => !post.eventId).reverse(),
    [allPosts]
  );

  return (
    <div className="relative flex h-full flex-col">
      <div className="relative flex justify-center gap-2 p-4">
        {announcements.length > 0 && (
          <button
            type="button"
            onClick={() => setAnnouncementsOpen(true)}
            aria-label="From MadGigz"
            className="absolute left-4 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-muted"
          >
            <MegaphoneIcon />
          </button>
        )}
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

      {announcementsOpen && (
        <AnnouncementsSheet
          announcements={announcements}
          onClose={() => setAnnouncementsOpen(false)}
        />
      )}
    </div>
  );
}

function MegaphoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1Z"
        fill="currentColor"
      />
      <path
        d="M14 8s2 1 2 4-2 4-2 4M17 5s3 2 3 7-3 7-3 7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

// A quick way to read MadGigz's own posts without scrolling the whole feed for
// them. A list rather than the full-screen cards - someone tapping this wants
// to catch up, not swipe through ten panels.
function AnnouncementsSheet({
  announcements,
  onClose,
}: {
  announcements: ContentPost[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface p-6 pb-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-muted/30" />
        <h2 className="font-display text-xl text-foreground">From MadGigz</h2>
        <p className="mt-1 text-sm text-muted">Tips and updates for getting around.</p>

        <div className="mt-5 flex flex-col gap-3">
          {announcements.map((post) => {
            const accent = post.accentColor || "#d76616";
            const hasMedia = Boolean(post.image) || post.mediaType === "video";
            return (
              <div key={post.id} className="flex items-start gap-3 rounded-2xl bg-background p-3">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl"
                  style={
                    hasMedia
                      ? undefined
                      : {
                          backgroundImage: `radial-gradient(120% 100% at 20% 15%, ${accent}66, transparent 60%)`,
                          backgroundColor: "#0a0807",
                        }
                  }
                >
                  {post.mediaType === "image" && post.image ? (
                    // eslint-disable-next-line @next/next/no-img-element -- Storage URL, small thumb
                    <img src={post.image} alt="" className="h-full w-full object-cover" />
                  ) : post.mediaType === "video" && post.videoUrl ? (
                    <video src={post.videoUrl} className="h-full w-full object-cover" muted />
                  ) : (
                    <span className="font-display text-base" style={{ color: accent }}>
                      MGz
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {post.headline && (
                    <p className="font-heading text-sm text-foreground">{post.headline}</p>
                  )}
                  {post.caption && <p className="text-sm text-muted">{post.caption}</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
