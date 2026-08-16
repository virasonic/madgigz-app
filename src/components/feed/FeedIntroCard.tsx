"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { ContentPost } from "@/lib/types";
import { streamHlsUrl, streamThumbnailUrl } from "@/lib/cloudflare-stream";
import { useT } from "@/lib/i18n/LocaleProvider";

// A full-screen artist introduction reel in the For You feed (#143 → discovery).
// Unlike ContentReelCard there's no show attached — the point is meeting the
// artist — so the CTA is "View profile" rather than "Get tickets". Same
// Cloudflare Stream HLS playback as the gig reels, and the same muted/in-view
// autoplay contract the feed drives.
interface FeedIntroCardProps {
  post: ContentPost;
  muted: boolean;
  onToggleMute: () => void;
  preload?: "auto" | "metadata" | "none";
}

export default function FeedIntroCard({ post, muted, onToggleMute, preload = "none" }: FeedIntroCardProps) {
  const { t } = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const activeRef = useRef(false);

  const streamUid = post.mediaType === "video" ? post.streamUid ?? null : null;
  const showVideo = post.mediaType === "video" && (Boolean(post.videoUrl) || Boolean(streamUid));
  const posterUrl = streamUid ? streamThumbnailUrl(streamUid) : post.image;
  const directSrc = streamUid ? undefined : post.videoUrl;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let destroyed = false;
    let hls: import("hls.js").default | undefined;
    const playIfActive = () => {
      if (!destroyed && activeRef.current) video.play().catch(() => {});
    };

    if (streamUid) {
      const src = streamHlsUrl(streamUid);
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
        playIfActive();
      } else {
        void (async () => {
          const Hls = (await import("hls.js")).default;
          if (destroyed || !videoRef.current) return;
          if (Hls.isSupported()) {
            hls = new Hls();
            hls.loadSource(src);
            hls.attachMedia(videoRef.current);
            hls.on(Hls.Events.MANIFEST_PARSED, playIfActive);
          } else {
            videoRef.current.src = src;
            playIfActive();
          }
        })();
      }
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        const active = entry.isIntersecting && entry.intersectionRatio >= 0.6;
        activeRef.current = active;
        if (active) video.play().catch(() => {});
        else {
          video.pause();
          video.currentTime = 0;
        }
      },
      { threshold: [0, 0.6, 1] }
    );
    observer.observe(video);

    return () => {
      destroyed = true;
      observer.disconnect();
      hls?.destroy();
    };
  }, [streamUid]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      {showVideo ? (
        <video
          ref={videoRef}
          src={directSrc}
          poster={posterUrl}
          preload={preload}
          className="absolute inset-0 h-full w-full object-cover"
          muted={muted}
          loop
          playsInline
          onClick={onToggleMute}
        />
      ) : (
        <Image src={post.image} alt={post.caption || post.artist} fill sizes="480px" className="object-cover" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/30" />

      <div className="absolute left-4 right-4 top-6 flex items-center gap-3">
        <span className="rounded-full bg-accent/90 px-3 py-1 text-xs font-heading uppercase tracking-wide text-foreground">
          {t("feed.newArtist")}
        </span>
        {showVideo && (
          <button
            onClick={onToggleMute}
            aria-label={muted ? t("feed.unmute") : t("feed.mute")}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-foreground backdrop-blur-md"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor" />
              {muted ? (
                <path d="m16 9 5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              ) : (
                <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              )}
            </svg>
          </button>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 flex flex-col gap-3 p-5 pb-8">
        <h2 className="font-display text-2xl text-foreground">{post.artist}</h2>
        {post.caption && <p className="text-sm text-foreground/90">{post.caption}</p>}
        {post.artistId && (
          <Link
            href={`/profile/${post.artistId}`}
            className="flex items-center justify-center rounded-2xl bg-primary px-5 py-3.5 font-display text-foreground"
          >
            {t("feed.viewProfile")}
          </Link>
        )}
      </div>
    </div>
  );
}
