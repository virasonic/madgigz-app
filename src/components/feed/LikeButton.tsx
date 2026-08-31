"use client";

import { EventItem } from "@/lib/types";

function HeartIcon({ filled, size }: { filled: boolean; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"}>
      <path
        d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.8}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// The one heart in the app. Liking is the same write everywhere - a row in
// saved_events - so it should also be the same control, rather than each
// surface growing its own copy of the icon and its own idea of what a like is.
export default function LikeButton({
  event,
  liked,
  onToggle,
  showLabel = false,
  size = 26,
  className = "",
}: {
  event: EventItem;
  liked: boolean;
  onToggle: () => void;
  showLabel?: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={liked ? `Unlike ${event.title}` : `Like ${event.title}`}
      aria-pressed={liked}
      className={`flex flex-col items-center gap-1 ${className}`}
      // The event's own accent when liked, so the fill reads as part of that
      // show rather than a generic red.
      style={{ color: liked ? event.accentColor : "var(--foreground)" }}
    >
      <HeartIcon filled={liked} size={size} />
      {showLabel && <span className="text-xs text-muted">{liked ? "Liked" : "Like"}</span>}
    </button>
  );
}
