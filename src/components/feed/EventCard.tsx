"use client";

import Image from "next/image";
import { EventItem } from "@/lib/types";

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"}>
      <path
        d="M12 20.5s-7.5-4.6-10-9.3C.5 8 2 4.5 5.5 4c2-.3 3.7.6 5 2.3C11.8 4.6 13.5 3.7 15.5 4c3.5.5 5 4 3.5 7.2-2.5 4.7-10 9.3-10 9.3Z"
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.8}
      />
    </svg>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

interface EventCardProps {
  event: EventItem;
  liked: boolean;
  onToggleLike: () => void;
  onOpen: () => void;
}

// The card behind Explore and an artist's show grid.
//
// This used to carry a second "feed" layout with a like button, a bookmark and
// a sold-out bar. Nothing rendered it - both call sites asked for the grid, and
// the grid returned before ever reaching that rail - so the like button in it
// was unreachable, and the one in it was `useState` that persisted nothing
// anyway. A tester noticed the symptom: liking only worked on reels. The dead
// layout is gone; the like is here, on the card people actually see, and wired
// to the same saved_events row the reel's heart writes.
export default function EventCard({ event, liked, onToggleLike, onOpen }: EventCardProps) {
  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl">
      <button onClick={onOpen} className="absolute inset-0 text-left">
        <Image src={event.image} alt={event.title} fill sizes="200px" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <p className="font-display text-sm text-foreground line-clamp-1">{event.title}</p>
          <p className="text-xs text-muted">{formatDate(event.date)}</p>
        </div>
      </button>

      {/* Outside the button above rather than inside it: nesting a button in a
          button is invalid HTML, and the tap would open the event instead of
          registering the like. */}
      <button
        type="button"
        onClick={onToggleLike}
        aria-label={liked ? `Unlike ${event.title}` : `Like ${event.title}`}
        aria-pressed={liked}
        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm"
        style={{ color: liked ? event.accentColor : "var(--foreground)" }}
      >
        <HeartIcon filled={liked} />
      </button>
    </div>
  );
}
