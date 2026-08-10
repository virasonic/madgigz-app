"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { ContentPost } from "@/lib/types";

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
}: {
  post: ContentPost;
  muted: boolean;
  onToggleMute: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const showVideo = post.mediaType === "video" && post.videoUrl;

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

  return (
    <div className="relative h-full w-full overflow-hidden bg-background">
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
        <Image src={post.image} alt={post.caption} fill sizes="480px" className="object-cover" />
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

      {post.caption && (
        <div className="absolute bottom-0 left-0 right-0 flex flex-col gap-3 p-5 pb-8">
          <span className="w-fit rounded-full bg-primary/90 px-3 py-1 text-xs font-heading uppercase tracking-wide text-foreground">
            From MadGigz
          </span>
          <p className="text-sm text-foreground">{post.caption}</p>
        </div>
      )}
    </div>
  );
}
