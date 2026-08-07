"use client";

import Image from "next/image";
import { useState } from "react";
import { ContentPost, EventItem } from "@/lib/types";

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"}>
      <path
        d="M12 20.5s-7.5-4.6-10-9.3C.5 8 2 4.5 5.5 4c2-.3 3.7.6 5 2.3C11.8 4.6 13.5 3.7 15.5 4c3.5.5 5 4 3.5 7.2-2.5 4.7-10 9.3-10 9.3Z"
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.8}
      />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <circle cx="18" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="18" cy="19" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m8.2 10.7 7.6-4.4M8.2 13.3l7.6 4.4" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

interface ContentReelCardProps {
  post: ContentPost;
  event: EventItem;
  onOpen: () => void;
}

export default function ContentReelCard({ post, event, onOpen }: ContentReelCardProps) {
  const [liked, setLiked] = useState(false);

  const showVideo = post.mediaType === "video" && post.videoUrl;

  return (
    <div className="relative h-full w-full overflow-hidden">
      {showVideo ? (
        <video
          src={post.videoUrl}
          poster={post.image}
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
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
          className="flex h-10 w-10 items-center justify-center rounded-full text-foreground"
          style={{ backgroundColor: event.accentColor }}
        >
          <MicIcon />
        </div>
        <div>
          <p className="font-heading text-sm text-foreground">{post.artist}</p>
          <p className="text-xs text-muted">{post.showTitle}</p>
        </div>
      </div>

      <div className="absolute bottom-24 right-4 flex flex-col items-center gap-6">
        <button
          onClick={() => setLiked((v) => !v)}
          style={{ color: liked ? event.accentColor : "var(--foreground)" }}
        >
          <HeartIcon filled={liked} />
        </button>
        <button className="text-foreground">
          <ShareIcon />
        </button>
      </div>

      <div className="absolute bottom-0 left-0 right-0 flex flex-col gap-3 p-5 pb-8">
        <span
          className="w-fit rounded-full px-3 py-1 text-xs font-heading uppercase tracking-wide text-foreground"
          style={{ backgroundColor: `${event.accentColor}CC` }}
        >
          Artist Content
        </span>
        <p className="text-sm text-foreground">{post.caption}</p>

        <button
          onClick={onOpen}
          className="flex items-center justify-between rounded-2xl border border-white/20 bg-white/10 px-5 py-3.5 backdrop-blur-md"
        >
          <span className="font-heading text-sm text-foreground">Tickets available now</span>
          <span className="font-display text-sm" style={{ color: event.accentColor }}>
            €{event.price}
          </span>
        </button>
      </div>
    </div>
  );
}
