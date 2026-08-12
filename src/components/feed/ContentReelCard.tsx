"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { ContentPost, EventItem } from "@/lib/types";
import ShareEventButton from "./ShareEventButton";
import LikeButton from "./LikeButton";
import ReportButton from "./ReportButton";
import { useT } from "@/lib/i18n/LocaleProvider";
import { dateLocale } from "@/lib/dates";

function NoteIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="8" cy="17" r="3" fill="currentColor" />
      <circle cx="16" cy="14" r="3" fill="currentColor" />
      <path d="M11 17V5l8-2v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor" />
      {muted ? (
        <path d="m16 9 5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path
          d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

function formatDate(iso: string, dl: string) {
  return new Date(iso).toLocaleDateString(dl, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

interface ContentReelCardProps {
  post: ContentPost;
  event: EventItem;
  muted: boolean;
  onToggleMute: () => void;
  onOpen: () => void;
  liked: boolean;
  onToggleLike: () => void;
}

export default function ContentReelCard({
  post,
  event,
  muted,
  onToggleMute,
  onOpen,
  liked,
  onToggleLike,
}: ContentReelCardProps) {
  const { t, locale } = useT();
  const dl = dateLocale(locale);
  const videoRef = useRef<HTMLVideoElement>(null);

  const showVideo = post.mediaType === "video" && post.videoUrl;

  // Only the reel actually in view should play - without this, every video
  // in the scroll-snap feed autoplays at once and their audio overlaps.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          video.play().catch(() => {});
        } else {
          video.pause();
          video.currentTime = 0;
        }
      },
      { threshold: [0, 0.6, 1] }
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden">
      {showVideo ? (
        <video
          ref={videoRef}
          src={post.videoUrl}
          poster={post.image}
          className="absolute inset-0 h-full w-full object-cover"
          muted={muted}
          loop
          playsInline
          onClick={onToggleMute}
        />
      ) : (
        <Image
          src={post.image}
          alt={post.caption}
          fill
          sizes="480px"
          className="object-cover"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/30" />

      <div className="absolute left-4 right-4 top-6 flex items-center gap-3">
        <div
          className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-foreground"
          style={{ backgroundColor: event.accentColor }}
        >
          {post.artistPhotoUrl ? (
            <Image
              src={post.artistPhotoUrl}
              alt=""
              fill
              sizes="40px"
              className="object-cover"
            />
          ) : (
            <NoteIcon />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {post.artistId ? (
            <Link href={`/profile/${post.artistId}`} className="font-heading text-sm text-foreground">
              {post.artist}
            </Link>
          ) : (
            <p className="font-heading text-sm text-foreground">{post.artist}</p>
          )}
        </div>
        {showVideo && (
          <button
            onClick={onToggleMute}
            aria-label={muted ? t("feed.unmute") : t("feed.mute")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/40 text-foreground backdrop-blur-md"
          >
            <SpeakerIcon muted={muted} />
          </button>
        )}
      </div>

      {/* z-10 keeps this rail above the caption block below - that block is
          full-width and comes later in the DOM, so without this it paints on
          top and swallows every tap on Like/Share. */}
      <div className="absolute bottom-24 right-4 z-10 flex flex-col items-center gap-6">
        {/* Stays in the rail, unchanged - a reel is scrolled full-screen, so
            its controls belong on the edge rather than in a sheet. */}
        <LikeButton event={event} liked={liked} onToggle={onToggleLike} />
        {/* Shares the gig, not the reel. A reel is an artist's post *about* a
            show; the recipient wants the show. */}
        <ShareEventButton event={event} />
        {/* Report is on artist content, not MadGigz's own announcements -
            those render through AnnouncementCard, which has no rail. */}
        <ReportButton contentPostId={post.id} />
      </div>

      <div className="absolute bottom-0 left-0 right-0 flex flex-col gap-3 p-5 pb-8">
        <span
          className="w-fit rounded-full px-3 py-1 text-xs font-heading uppercase tracking-wide text-foreground"
          style={{ backgroundColor: `${event.accentColor}CC` }}
        >
          {t("feed.artistContent")}
        </span>

        <div>
          <h2 className="font-display text-2xl text-foreground">{event.title}</h2>
          <p className="mt-1 text-sm text-muted">{event.venue}</p>
          <p className="text-sm text-muted">
            {formatDate(event.date, dl)} · {event.time}
          </p>
        </div>

        {post.caption && <p className="text-sm text-foreground">{post.caption}</p>}

        <button
          onClick={onOpen}
          className="flex items-center justify-between rounded-2xl px-5 py-3.5"
          style={{ backgroundColor: event.accentColor }}
        >
          <span className="font-display text-foreground">{t("feed.getTickets")}</span>
          <span className="font-heading text-foreground">€{event.price}</span>
        </button>
      </div>
    </div>
  );
}
