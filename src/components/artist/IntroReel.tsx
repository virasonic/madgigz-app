"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ContentPost } from "@/lib/types";
import { streamHlsUrl, streamThumbnailUrl } from "@/lib/cloudflare-stream";
import { useT } from "@/lib/i18n/LocaleProvider";

// The artist's pinned introduction reel (#143), shown on their profile as a
// small POSTER-sized thumbnail (same footprint as a show poster) so it sits
// beside the bio and never pushes the shows below the fold. Tapping it opens the
// clip full-screen. Reuses the Cloudflare Stream HLS playback the feed uses.
export default function IntroReel({ post }: { post: ContentPost }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  const streamUid = post.mediaType === "video" ? post.streamUid ?? null : null;
  const isVideo = post.mediaType === "video" && (Boolean(post.videoUrl) || Boolean(streamUid));
  const posterUrl = streamUid ? streamThumbnailUrl(streamUid) : post.image;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("introReel.open")}
        className="relative block aspect-[3/4] w-full overflow-hidden rounded-2xl bg-surface"
      >
        {posterUrl ? (
          <Image src={posterUrl} alt={post.caption || ""} fill sizes="180px" className="object-cover" />
        ) : (
          <div className="absolute inset-0" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        {/* Play affordance so it reads as a clip to open, not a static image. */}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-foreground backdrop-blur-sm">
            {isVideo ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
        </span>
        <span className="absolute bottom-2 left-2 right-2 truncate text-left text-[11px] font-heading uppercase tracking-wide text-foreground">
          {t("introReel.label")}
        </span>
      </button>

      {open && <IntroReelViewer post={post} onClose={() => setOpen(false)} />}
    </>
  );
}

// Full-screen player, opened from the thumbnail. Autoplays with sound (a
// deliberate tap opened it), tap to mute, tap the backdrop or the close button
// to dismiss.
function IntroReelViewer({ post, onClose }: { post: ContentPost; onClose: () => void }) {
  const { t } = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);

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
        video.play().catch(() => {});
      } else {
        void (async () => {
          const Hls = (await import("hls.js")).default;
          if (destroyed || !videoRef.current) return;
          if (Hls.isSupported()) {
            hls = new Hls();
            hls.loadSource(src);
            hls.attachMedia(videoRef.current);
            hls.on(Hls.Events.MANIFEST_PARSED, () => videoRef.current?.play().catch(() => {}));
          } else {
            videoRef.current.src = src;
            videoRef.current.play().catch(() => {});
          }
        })();
      }
    } else {
      video.play().catch(() => {});
    }

    return () => {
      destroyed = true;
      hls?.destroy();
    };
  }, [streamUid, showVideo]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        className="relative aspect-[9/16] max-h-[90vh] w-full max-w-sm overflow-hidden rounded-3xl bg-surface"
        onClick={(e) => e.stopPropagation()}
      >
        {showVideo ? (
          <video
            ref={videoRef}
            src={directSrc}
            poster={posterUrl}
            className="absolute inset-0 h-full w-full object-cover"
            muted={muted}
            loop
            playsInline
            onClick={() => setMuted((m) => !m)}
          />
        ) : (
          <Image src={post.image} alt={post.caption || ""} fill sizes="384px" className="object-cover" />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-foreground backdrop-blur-md"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>

        {post.caption && (
          <p className="absolute bottom-0 left-0 right-0 p-4 text-sm text-foreground">{post.caption}</p>
        )}
      </div>
    </div>
  );
}
