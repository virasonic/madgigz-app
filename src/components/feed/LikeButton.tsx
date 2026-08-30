"use client";

import { EventItem } from "@/lib/types";

function HeartIcon({ filled, size }: { filled: boolean; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"}>
      <path
        d="M12 20.5s-7.5-4.6-10-9.3C.5 8 2 4.5 5.5 4c2-.3 3.7.6 5 2.3C11.8 4.6 13.5 3.7 15.5 4c3.5.5 5 4 3.5 7.2-2.5 4.7-10 9.3-10 9.3Z"
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
