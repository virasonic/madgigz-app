"use client";

import Image from "next/image";
import { useState } from "react";
import { EventItem } from "@/lib/mock-data";

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

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"}>
      <path
        d="M6 4h12a1 1 0 0 1 1 1v15l-7-4-7 4V5a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.8}
        strokeLinejoin="round"
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
      <path
        d="m8.2 10.7 7.6-4.4M8.2 13.3l7.6 4.4"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

async function shareEvent(event: EventItem) {
  const shareData = {
    title: event.title,
    text: `${event.title} at ${event.venue}, ${formatDate(event.date)}`,
    url: typeof window !== "undefined" ? window.location.href : undefined,
  };
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share(shareData);
      return;
    } catch {
      // user cancelled - ignore
    }
  }
  if (typeof navigator !== "undefined" && navigator.clipboard && shareData.url) {
    navigator.clipboard.writeText(shareData.url).catch(() => {});
  }
}

interface EventCardProps {
  event: EventItem;
  saved: boolean;
  onToggleSave: () => void;
  onOpen: () => void;
  variant?: "feed" | "grid";
}

export default function EventCard({
  event,
  saved,
  onToggleSave,
  onOpen,
  variant = "feed",
}: EventCardProps) {
  const [liked, setLiked] = useState(false);
  const soldPercent = Math.round((event.sold / event.capacity) * 100);
  const almostGone = soldPercent >= 90;

  if (variant === "grid") {
    return (
      <button
        onClick={onOpen}
        className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl text-left"
      >
        <Image
          src={event.image}
          alt={event.title}
          fill
          sizes="200px"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <p className="font-display text-sm text-foreground line-clamp-1">{event.title}</p>
          <p className="text-xs text-muted">{formatDate(event.date)}</p>
        </div>
      </button>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <Image
        src={event.image}
        alt={event.title}
        fill
        sizes="480px"
        priority
        className="object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/25" />

      <div className="absolute left-4 right-20 top-6 flex items-center gap-2">
        <span
          className="rounded-full px-3 py-1 text-xs font-heading uppercase tracking-wide text-foreground"
          style={{ backgroundColor: `${event.accentColor}CC` }}
        >
          {event.category}
        </span>
        {almostGone && (
          <span className="rounded-full bg-danger px-3 py-1 text-xs font-heading uppercase tracking-wide text-foreground">
            Almost gone
          </span>
        )}
      </div>

      <div className="absolute bottom-24 right-4 flex flex-col items-center gap-6">
        <button
          onClick={() => setLiked((v) => !v)}
          className="flex flex-col items-center gap-1"
          style={{ color: liked ? event.accentColor : "var(--foreground)" }}
        >
          <HeartIcon filled={liked} />
        </button>
        <button
          onClick={onToggleSave}
          className="flex flex-col items-center gap-1 text-foreground"
          style={{ color: saved ? "var(--primary)" : "var(--foreground)" }}
        >
          <BookmarkIcon filled={saved} />
        </button>
        <button
          onClick={() => shareEvent(event)}
          className="flex flex-col items-center gap-1 text-foreground"
        >
          <ShareIcon />
        </button>
      </div>

      <button
        onClick={onOpen}
        className="absolute bottom-0 left-0 right-0 flex flex-col gap-3 p-5 pb-8 text-left"
      >
        <div>
          <h2 className="font-display text-2xl text-foreground">{event.title}</h2>
          <p className="mt-1 text-sm text-muted">
            {event.artist} · {event.venue}
          </p>
          <p className="text-sm text-muted">
            {formatDate(event.date)} · {event.time}
          </p>
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full"
            style={{ width: `${soldPercent}%`, backgroundColor: event.accentColor }}
          />
        </div>

        <div
          className="mt-1 flex items-center justify-between rounded-2xl px-5 py-3.5"
          style={{ backgroundColor: event.accentColor }}
        >
          <span className="font-display text-foreground">Get Tickets</span>
          <span className="font-heading text-foreground">
            €{event.price}
          </span>
        </div>
      </button>
    </div>
  );
}
