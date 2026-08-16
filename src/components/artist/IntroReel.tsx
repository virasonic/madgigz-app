"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ContentPost } from "@/lib/types";
import { streamHlsUrl, streamThumbnailUrl } from "@/lib/cloudflare-stream";
import { useT } from "@/lib/i18n/LocaleProvider";

// The artist's pinned introduction reel (#143), shown on their profile. Unlike
// ContentReelCard this carries no event chrome (no title/price/get-tickets) — it
// is just "this is me, this is my sound": a contained 9:16 clip that autoplays
// muted when scrolled into view, tap to unmute. Reuses the Cloudflare Stream HLS
// playback the feed uses, so a Stream reel plays here identically.
export default function IntroReel({ post }: { post: ContentPost }) {
  const { t } = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  const streamUid = post.mediaType === "video" ? post.streamUid ?? null : null;
  const showVideo = post.mediaType === "video" && (Boolean(post.videoUrl) || Boolean(streamUid));
  const posterUrl = streamUid ? streamThumbnailUrl(streamUid) : post.image;
  const directSrc = streamUid ? undefined : post.videoUrl;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !showVideo) return;

    let destroyed = false;
    let hls: import("hls.js").default | undefined;

    if (streamUid) {
      const src = streamHlsUrl(streamUid);
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
      } else {
        void (async () => {
          const Hls = (await import("hls.js")).default;
          if (destroyed || !videoRef.current) return;
          if (Hls.isSupported()) {
            hls = new Hls();
            hls.loadSource(src);
            hls.attachMedia(videoRef.current);
          } else {
            videoRef.current.src = src;
          }
        })();
      }
    }

    // Play only while on screen — a profile can hold the intro alongside a list
    // of shows, so it shouldn't stream until the fan actually looks at it (#101).
    const observer = new IntersectionObserver(
      ([entry]) => {
        const active = entry.isIntersecting && entry.intersectionRatio >= 0.5;
        if (active) video.play().catch(() => {});
        else {
          video.pause();
          video.currentTime = 0;
        }
      },
      { threshold: [0, 0.5, 1] }
    );
    observer.observe(video);

    return () => {
      destroyed = true;
      observer.disconnect();
      hls?.destroy();
    };
  }, [streamUid, showVideo]);

  return (
    <div className="relative mx-auto aspect-[9/16] max-h-[70vh] w-full overflow-hidden rounded-3xl bg-surface">
      {showVideo ? (
        <video
          ref={videoRef}
          src={directSrc}
          poster={posterUrl}
          preload="none"
          className="absolute inset-0 h-full w-full object-cover"
          muted={muted}
          loop
          playsInline
          onClick={() => setMuted((m) => !m)}
        />
      ) : (
        <Image src={post.image} alt={post.caption || ""} fill sizes="480px" className="object-cover" />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

      {showVideo && (
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? t("feed.unmute") : t("feed.mute")}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-foreground backdrop-blur-md"
        >
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
        </button>
      )}

      {post.caption && (
        <p className="absolute bottom-0 left-0 right-0 p-4 text-sm text-foreground">{post.caption}</p>
      )}
    </div>
  );
}
