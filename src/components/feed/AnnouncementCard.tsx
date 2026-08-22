"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { ContentPost } from "@/lib/types";
import { useT } from "@/lib/i18n/LocaleProvider";

// A post from MadGigz itself rather than from an artist about a show.
//
// Kept as its own component rather than a branch inside ContentReelCard,
// because almost everything that card does needs an event: the accent colour,
// the title, the venue, the date, Like, Share, and the "Tickets available now"
// panel. An announcement has none of those, and threading `event | null`
// through all of it would leave a component that is mostly null checks.
export default function AnnouncementCard({
  post,
  muted,
  onToggleMute,
  onSeen,
}: {
  post: ContentPost;
  muted: boolean;
  onToggleMute: () => void;
  /** Fires once the card has actually been on screen, not merely rendered. */
  onSeen?: (id: string) => void;
}) {
  const { t, locale } = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const showVideo = post.mediaType === "video" && post.videoUrl;

  // Announcements follow the reader's language (addendum_043): a Spanish reader
  // gets the Spanish variant when the admin supplied one, and everyone else -
  // plus any announcement left English-only - gets the base text. Empty strings
  // count as "not translated", so a blank ES field never blanks the card.
  const isSpanish = locale === "es";
  const headline = isSpanish && post.headlineEs ? post.headlineEs : post.headline;
  const caption = isSpanish && post.captionEs ? post.captionEs : post.caption;
  // A text announcement carries no media - it is drawn on the brand template in
  // CSS below, which is how the admin panel composes one without any image
  // generation. See addendum_029.
  const isText = post.mediaType === "text" || (!post.image && !showVideo);
  const accent = post.accentColor || "#d76616";

  // "Seen" means it filled the screen for a moment, not that it existed in the
  // DOM - the whole list is mounted at once in a snap scroller, so mount-time
  // marking would retire every announcement the instant the feed loaded.
  useEffect(() => {
    const node = cardRef.current;
    if (!node || !onSeen) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // A brief dwell, so flicking past at speed doesn't count as reading.
          timer = setTimeout(() => onSeen(post.id), 1200);
        } else if (timer) {
          clearTimeout(timer);
        }
      },
      { threshold: 0.6 }
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [post.id, onSeen]);

  // Same as the reel card: only the one in view plays, or every video in the
  // feed runs at once.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else {
          video.pause();
          video.currentTime = 0;
        }
      },
      { threshold: 0.6 }
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, [showVideo]);

  if (isText) {
    return (
      <div
        ref={cardRef}
        className="relative flex h-full w-full flex-col justify-center overflow-hidden bg-background px-8"
        // The template: two soft brand-coloured washes on the near-black
        // canvas, the same look as the generated cards but drawn live, so it is
        // always on-brand and always editable.
        style={{
          backgroundImage: `radial-gradient(120% 80% at 15% 12%, ${accent}55, transparent 60%), radial-gradient(120% 80% at 90% 95%, #0d5c6d55, transparent 55%)`,
        }}
      >
        <div className="absolute left-4 right-4 top-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary">
            <Image src="/logos/mgz-mark.png" alt="" width={22} height={22} />
          </div>
          <p className="font-heading text-sm text-foreground">MadGigz</p>
        </div>

        <div className="flex flex-col gap-5">
          <span
            className="w-fit rounded-full px-3 py-1 text-xs font-heading uppercase tracking-wide text-foreground"
            style={{ backgroundColor: accent }}
          >
            {t("feed.fromMadgigz")}
          </span>
          {headline && (
            <h2 className="font-display text-3xl leading-tight text-foreground">{headline}</h2>
          )}
          {caption && <p className="text-base text-muted">{caption}</p>}
        </div>
      </div>
    );
  }

  return (
    <div ref={cardRef} className="relative h-full w-full overflow-hidden bg-background">
      {showVideo ? (
        <video
          ref={videoRef}
          src={post.videoUrl}
          className="absolute inset-0 h-full w-full object-cover"
          muted={muted}
          loop
          playsInline
          onClick={onToggleMute}
        />
      ) : (
        <Image src={post.image} alt={caption} fill sizes="480px" className="object-cover" />
      )}

      {/* Lighter than the reel gradient: these cards are designed artwork with
          their own type, so there is less to rescue from a busy photo and more
          to avoid smothering. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />

      <div className="absolute left-4 right-4 top-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary">
          <Image src="/logos/mgz-mark.png" alt="" width={22} height={22} />
        </div>
        <p className="font-heading text-sm text-foreground">{post.artist}</p>
      </div>

      {caption && (
        <div className="absolute bottom-0 left-0 right-0 flex flex-col gap-3 p-5 pb-8">
          <span className="w-fit rounded-full bg-primary/90 px-3 py-1 text-xs font-heading uppercase tracking-wide text-foreground">
            {t("feed.fromMadgigz")}
          </span>
          <p className="text-sm text-foreground">{caption}</p>
        </div>
      )}
    </div>
  );
}
