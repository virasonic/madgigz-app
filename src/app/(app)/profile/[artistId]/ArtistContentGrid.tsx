"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import ContentReelCard from "@/components/feed/ContentReelCard";
import AnnouncementCard from "@/components/feed/AnnouncementCard";
import FeedIntroCard from "@/components/feed/FeedIntroCard";
import { createClient } from "@/lib/supabase/client";
import { toggleSavedEvent } from "@/lib/supabase/queries";
import { ContentPost, EventItem } from "@/lib/types";
import { useGuestGate } from "@/components/auth/GuestGate";
import { useT } from "@/lib/i18n/LocaleProvider";
import { streamThumbnailUrl } from "@/lib/cloudflare-stream";

// The Content tab on an artist/organiser profile: a grid of everything they've
// posted (gig reels, photos, announcements), tapping one into a full-screen
// scroller through all of it - the feed interaction, scoped to this one artist.
// eventMap carries the shows the gig posts belong to (ContentReelCard needs the
// event); a post whose show is hidden or cancelled isn't in the map and is
// dropped, since there's nothing to open it onto.
export default function ArtistContentGrid({
  posts,
  eventMap,
  userId,
  initialSavedIds,
}: {
  posts: ContentPost[];
  eventMap: Record<string, EventItem>;
  userId: string | null;
  initialSavedIds: string[];
}) {
  const { t } = useT();
  const router = useRouter();
  const { promptSignup, sheet } = useGuestGate();
  const [savedIds, setSavedIds] = useState<string[]>(initialSavedIds);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  // A gig post needs its show present to render; an announcement (no event) is
  // always displayable. Keep the query's newest-first order.
  const displayPosts = useMemo(
    () => posts.filter((p) => (p.eventId ? Boolean(eventMap[p.eventId]) : true)),
    [posts, eventMap]
  );

  async function handleToggleLike(eventId: string) {
    // Guests browse but don't save - the tap becomes the sign-up prompt, same as
    // the shows grid and the feed.
    if (!userId) {
      promptSignup();
      return;
    }
    const wasSaved = savedIds.includes(eventId);
    setSavedIds((ids) => (wasSaved ? ids.filter((id) => id !== eventId) : [...ids, eventId]));
    const supabase = createClient();
    const ok = await toggleSavedEvent(supabase, userId, eventId, wasSaved);
    if (!ok) {
      setSavedIds((ids) => (wasSaved ? [...ids, eventId] : ids.filter((id) => id !== eventId)));
      return;
    }
    router.refresh();
  }

  if (displayPosts.length === 0) {
    return <p className="mt-6 text-sm text-muted">{t("profile.contentEmpty")}</p>;
  }

  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {displayPosts.map((post, index) => (
          <ContentTile key={post.id} post={post} onOpen={() => setOpenIndex(index)} />
        ))}
      </div>

      {openIndex !== null && (
        <ArtistContentViewer
          posts={displayPosts}
          eventMap={eventMap}
          startIndex={openIndex}
          savedIds={savedIds}
          onToggleLike={handleToggleLike}
          onOpenEvent={(eventId) => router.push(`/e/${eventId}`)}
          onClose={() => setOpenIndex(null)}
        />
      )}
      {sheet}
    </>
  );
}

// One grid tile: a poster-shaped thumbnail. Video posts get a play badge over
// their Stream thumbnail (or their own image); text announcements have no image,
// so they render as a titled card on the post's accent colour.
function ContentTile({ post, onOpen }: { post: ContentPost; onOpen: () => void }) {
  const { t } = useT();
  const isVideo = post.mediaType === "video";
  const thumb = isVideo && post.streamUid ? streamThumbnailUrl(post.streamUid) : post.image;
  const label = post.showTitle || post.caption || post.headline || "";

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("profile.openContent")}
      className="relative block aspect-[3/4] w-full overflow-hidden rounded-2xl bg-surface text-left"
    >
      {thumb ? (
        <Image src={thumb} alt={label} fill sizes="200px" className="object-cover" />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center p-3 text-center"
          style={post.accentColor ? { backgroundColor: post.accentColor } : undefined}
        >
          <span className="line-clamp-3 font-heading text-sm text-foreground">{label}</span>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
      {isVideo && (
        <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      )}
      {label && (
        <span className="absolute inset-x-0 bottom-0 line-clamp-1 p-2 font-display text-xs text-foreground">
          {label}
        </span>
      )}
    </button>
  );
}

// Full-screen scroller, seeded on the tapped post. Each card is the same one the
// feed uses and self-manages its own play/pause on visibility, so this only has
// to lay them out in a snap track, start on the right one, and keep video
// preload to the neighbours (egress, #101).
function ArtistContentViewer({
  posts,
  eventMap,
  startIndex,
  savedIds,
  onToggleLike,
  onOpenEvent,
  onClose,
}: {
  posts: ContentPost[];
  eventMap: Record<string, EventItem>;
  startIndex: number;
  savedIds: string[];
  onToggleLike: (eventId: string) => void;
  onOpenEvent: (eventId: string) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [muted, setMuted] = useState(true);
  const [activeIndex, setActiveIndex] = useState(startIndex);

  // Land on the tapped post without animating through everything above it, and
  // lock the page body behind the overlay so a scroll past the ends doesn't move
  // the profile underneath. Both are DOM-only, so an effect is the right home.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = startIndex * el.clientHeight;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [startIndex]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el || el.clientHeight === 0) return;
    setActiveIndex(Math.round(el.scrollTop / el.clientHeight));
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* The close button lives in its own bar with pt-safe, so it clears the
          notch/status bar - a fixed overlay sits outside the (app) shell that
          normally provides that inset, which is why a plain top-3 landed
          under the status bar and wouldn't take a tap (Vir, 27 Oct). The reel
          track below it then starts under the bar, like the feed does. */}
      <div className="pt-safe flex shrink-0 justify-end px-3 pb-1">
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="no-scrollbar min-h-0 w-full flex-1 snap-y snap-mandatory overflow-y-scroll overscroll-y-contain"
      >
        {posts.map((post, index) => {
          const event = post.eventId ? eventMap[post.eventId] : undefined;
          const preload = Math.abs(index - activeIndex) <= 1 ? "auto" : "none";
          return (
            <div
              key={post.id}
              className="h-full w-full snap-start snap-always lg:flex lg:items-center lg:justify-center"
            >
              <div className="h-full w-full overflow-hidden lg:aspect-[9/16] lg:h-[min(100%,calc(26rem*16/9))] lg:w-auto lg:rounded-2xl">
                {event ? (
                  <ContentReelCard
                    post={post}
                    event={event}
                    muted={muted}
                    onToggleMute={() => setMuted((v) => !v)}
                    onOpen={() => onOpenEvent(event.id)}
                    liked={savedIds.includes(event.id)}
                    onToggleLike={() => onToggleLike(event.id)}
                    preload={preload}
                  />
                ) : post.isIntro ? (
                  // The intro reel has no event; it plays through the same card the
                  // feed's "meet a new artist" slot uses.
                  <FeedIntroCard
                    post={post}
                    muted={muted}
                    onToggleMute={() => setMuted((v) => !v)}
                    preload={preload}
                  />
                ) : (
                  <AnnouncementCard post={post} muted={muted} onToggleMute={() => setMuted((v) => !v)} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
