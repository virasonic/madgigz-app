"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TicketModal from "@/components/feed/TicketModal";
import ContentReelCard from "@/components/feed/ContentReelCard";
import AnnouncementCard from "@/components/feed/AnnouncementCard";
import AddContentModal from "@/components/artist/AddContentModal";
import { createClient } from "@/lib/supabase/client";
import { fetchContentPosts, toggleSavedEvent } from "@/lib/supabase/queries";
import { AppUser, ContentPost, EventItem } from "@/lib/types";
import { canActAsArtist } from "@/lib/roles";
import { getSeenAnnouncements, markAnnouncementSeen } from "@/lib/seen-announcements";
import { useUrlModal } from "@/lib/useUrlModal";
import { useT } from "@/lib/i18n/LocaleProvider";
import { dateLocale } from "@/lib/dates";
import CityBadge from "@/components/ui/CityBadge";

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

function groupByDay(items: EventItem[], dateLocale: string) {
  const groups = new Map<string, EventItem[]>();
  [...items]
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((event) => {
      const key = new Date(event.date).toLocaleDateString(dateLocale, {
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
  const { t, locale } = useT();
  const [pane, setPane] = useState<Pane>("forYou");
  const [allPosts, setAllPosts] = useState<ContentPost[]>(initialPosts);
  // #102: the open ticket and the announcements sheet live in the URL now, so
  // the back button closes them, they survive a refresh, and a ticket link is
  // shareable. activeEvent is resolved from the ?ticket=<id> param below.
  const ticketModal = useUrlModal("ticket");
  const announcementsModal = useUrlModal("panel");
  const announcementsOpen = announcementsModal.value === "announcements";
  const [addContentOpen, setAddContentOpen] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>(initialSavedIds);
  // Browsers block autoplay-with-sound, so reels start muted like TikTok/Reels;
  // shared (not per-card) so unmuting once stays unmuted as you scroll.
  const [reelsMuted, setReelsMuted] = useState(true);

  const followed = useMemo(() => new Set(followedEventIds), [followedEventIds]);

  // Desktop-only prev/next arrows scroll the snap feed by exactly one card
  // (each slide is the container's own height), so a click lands on the next
  // reel and snap-mandatory keeps it aligned. Trackpad scrolling is unaffected.
  const forYouScrollRef = useRef<HTMLDivElement>(null);
  const scrollFeed = useCallback((dir: 1 | -1) => {
    const el = forYouScrollRef.current;
    if (!el) return;
    el.scrollBy({ top: dir * el.clientHeight, behavior: "smooth" });
  }, []);

  // Read once, on mount, and never updated while the pane is open. That is
  // deliberate: marking a card seen must not re-order the list under the
  // finger of the person currently reading it. The new order applies next time
  // they open the feed.
  const [seenAnnouncements, setSeenAnnouncements] = useState<Set<string>>(new Set());
  const [seenLoaded, setSeenLoaded] = useState(false);
  useEffect(() => {
    // localStorage cannot be read during render: the server has no window, so
    // a lazy useState initialiser would return an empty set on the server and a
    // populated one on the client, and the feed would hydrate in a different
    // order than it rendered. Reading after mount is the correct shape here.
    /* eslint-disable react-hooks/set-state-in-effect -- see above */
    setSeenAnnouncements(new Set(getSeenAnnouncements()));
    setSeenLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Once the seen-order is applied, land at the TOP of the feed rather than
  // wherever the browser restored the snap container to on refresh. After a seen
  // announcement drops to the bottom, that restored scroll position can sit
  // mid-feed on an announcement - which is what "I spawn on the announcement"
  // was. rAF so this runs after the browser's own scroll restoration.
  useEffect(() => {
    if (!seenLoaded) return;
    const el = forYouScrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => el.scrollTo({ top: 0 }));
    return () => cancelAnimationFrame(id);
  }, [seenLoaded]);

  const handleAnnouncementSeen = useCallback((id: string) => {
    markAnnouncementSeen(id);
  }, []);

  // The show behind ?ticket=<id>. Null when the param is absent or points at an
  // event this feed doesn't hold (e.g. a stale link) - the sheet just stays shut.
  const activeEvent = useMemo(
    () => initialEvents.find((e) => e.id === ticketModal.value) ?? null,
    [initialEvents, ticketModal.value]
  );

  const forYouFeed = useMemo(
    () => buildForYouFeed(initialEvents, allPosts, followed, seenAnnouncements),
    [initialEvents, allPosts, followed, seenAnnouncements]
  );
  // groupByDay re-sorts by date, and Array.sort is stable, so pre-sorting
  // followed-first keeps the days in order while lifting followed artists
  // within each one. This Week is a schedule; it can't stop being chronological.
  // The day headers ("viernes 15 agosto") follow the app's language.
  const dl = dateLocale(locale);
  const weeklyGroups = useMemo(
    () =>
      groupByDay(
        [...withinNextWeek(initialEvents)].sort(
          (a, b) => Number(followed.has(b.id)) - Number(followed.has(a.id))
        ),
        dl
      ),
    [initialEvents, followed, dl]
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
      <div className="flex justify-center pt-3">
        <CityBadge />
      </div>
      <div className="relative mx-auto flex w-full justify-center gap-2 px-4 pb-4 pt-2 lg:max-w-[26rem]">
        {/* Mobile only: desktop opens announcements from the SideNav rail and
            shows them in a column beside the feed, not this header + sheet. */}
        {announcements.length > 0 && (
          <button
            type="button"
            onClick={() => announcementsModal.open("announcements")}
            aria-label={t("feed.fromMadgigz")}
            className="absolute left-4 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-muted lg:hidden"
          >
            <MegaphoneIcon />
          </button>
        )}
        {canActAsArtist(user) && (
          <button
            type="button"
            onClick={() => setAddContentOpen(true)}
            aria-label={t("feed.postUpdate")}
            className="absolute right-4 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-lg text-foreground"
          >
            +
          </button>
        )}
        {(
          [
            ["forYou", t("feed.forYou")],
            ["thisWeek", t("feed.thisWeek")],
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

      <div className="min-h-0 flex-1 lg:flex lg:flex-row">
        {/* Desktop: announcements open in-flow as a column to the left of the
            feed, which re-centres the reel in the remaining width — side by
            side, no overlay. Hidden on mobile, where the bottom sheet below
            handles it instead (right for a phone). */}
        {announcementsOpen && (
          <DesktopAnnouncements
            announcements={announcements}
            onClose={announcementsModal.close}
          />
        )}
        <div className="relative h-full min-h-0 min-w-0 lg:flex-1">
        {pane === "forYou" ? (
          forYouFeed.length === 0 ? (
            <p className="mt-6 px-4 text-center text-sm text-muted">{t("feed.emptyForYou")}</p>
          ) : (
            <div className="relative h-full">
            <div
              ref={forYouScrollRef}
              className="h-full w-full snap-y snap-mandatory overflow-y-scroll"
            >
              {forYouFeed.map((entry) => (
                // Mobile: the card fills the viewport (unchanged). Desktop: centre
                // a fixed 9:16 card that fits *inside* the window — height clamped
                // to the smaller of the viewport or a 26rem-wide card's height, so
                // the video never re-crops as the window gets taller or shorter.
                <div
                  key={entry.post.id}
                  className="h-full w-full snap-start lg:flex lg:items-center lg:justify-center"
                >
                  <div className="h-full w-full overflow-hidden lg:aspect-[9/16] lg:h-[min(100%,calc(26rem*16/9))] lg:w-auto lg:rounded-2xl">
                  {entry.event ? (
                    <ContentReelCard
                      post={entry.post}
                      event={entry.event}
                      muted={reelsMuted}
                      onToggleMute={() => setReelsMuted((v) => !v)}
                      onOpen={() => ticketModal.open(entry.event!.id)}
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
                </div>
              ))}
            </div>

            {/* Desktop-only prev/next, TikTok-web style. Anchored just past the
                right edge of the centred 26rem card; snaps one reel per click.
                pointer-events-none on the column so its empty space never
                blocks a tap or scroll on the card behind it. When the
                announcements column is open it steals 20rem, so the reel track
                narrows and the arrows would clip the viewport edge at lg — hold
                them back to xl there, where there's room again. Trackpad scroll
                is unaffected either way. */}
            <div
              className={`pointer-events-none absolute left-1/2 top-1/2 z-10 hidden -translate-y-1/2 flex-col gap-3 ${
                announcementsOpen ? "xl:flex" : "lg:flex"
              }`}
              style={{ marginLeft: "13.5rem" }}
            >
              <button
                type="button"
                onClick={() => scrollFeed(-1)}
                aria-label={t("feed.previousReel")}
                className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-surface text-muted backdrop-blur transition-colors hover:bg-primary hover:text-foreground"
              >
                <ChevronIcon dir="up" />
              </button>
              <button
                type="button"
                onClick={() => scrollFeed(1)}
                aria-label={t("feed.nextReel")}
                className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-surface text-muted backdrop-blur transition-colors hover:bg-primary hover:text-foreground"
              >
                <ChevronIcon dir="down" />
              </button>
            </div>
            </div>
          )
        ) : (
          <div className="mx-auto h-full w-full overflow-y-auto px-4 pb-6 lg:max-w-xl">
            {weeklyGroups.length === 0 ? (
              <p className="mt-6 text-center text-sm text-muted">{t("feed.emptyThisWeek")}</p>
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
                        onClick={() => ticketModal.open(event.id)}
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
                        {/* Category pill dropped: every event is live music, so
                            the tag said nothing. Price is the useful right-hand
                            signal. */}
                        <div className="flex flex-col items-end gap-1">
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
      </div>

      {activeEvent && (
        <TicketModal
          key={activeEvent.id}
          event={activeEvent}
          liked={savedIds.includes(activeEvent.id)}
          onToggleLike={() => handleToggleLike(activeEvent.id)}
          onClose={ticketModal.close}
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
          onClose={announcementsModal.close}
        />
      )}
    </div>
  );
}

function ChevronIcon({ dir }: { dir: "up" | "down" }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={dir === "down" ? "rotate-180" : undefined}
    >
      <path d="M6 15l6-6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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

// The list of MadGigz's own posts - a catch-up list, not the full-screen swipe
// cards. Shared by the mobile bottom sheet and the desktop side column so the
// two renderings can't drift.
function AnnouncementsList({ announcements }: { announcements: ContentPost[] }) {
  return (
    <div className="flex flex-col gap-3">
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
  );
}

// Mobile: the bottom sheet, unchanged - the right affordance on a phone. Hidden
// on desktop, which shows DesktopAnnouncements beside the feed instead.
function AnnouncementsSheet({
  announcements,
  onClose,
}: {
  announcements: ContentPost[];
  onClose: () => void;
}) {
  const { t } = useT();
  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 lg:hidden"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface p-6 pb-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-muted/30" />
        <h2 className="font-display text-xl text-foreground">{t("feed.fromMadgigz")}</h2>
        <p className="mt-1 text-sm text-muted">{t("feed.announcementsSubtitle")}</p>
        <div className="mt-5">
          <AnnouncementsList announcements={announcements} />
        </div>
      </div>
    </div>
  );
}

// Desktop (#120): announcements as an in-flow column beside the feed, not an
// overlay - it sits in the empty canvas the centred reel leaves and pushes the
// reel to re-centre in the rest. Its own scroll, and a close button since there
// is no backdrop to tap.
function DesktopAnnouncements({
  announcements,
  onClose,
}: {
  announcements: ContentPost[];
  onClose: () => void;
}) {
  const { t } = useT();
  return (
    <aside className="hidden lg:flex lg:w-80 lg:shrink-0 lg:flex-col lg:border-r lg:border-muted/15">
      <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
        <div className="min-w-0">
          <h2 className="font-display text-xl text-foreground">{t("feed.fromMadgigz")}</h2>
          <p className="mt-1 text-sm text-muted">{t("feed.announcementsSubtitle")}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("feed.closeAnnouncements")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-muted transition-colors hover:bg-primary hover:text-foreground"
        >
          <CloseIcon />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        <AnnouncementsList announcements={announcements} />
      </div>
    </aside>
  );
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
