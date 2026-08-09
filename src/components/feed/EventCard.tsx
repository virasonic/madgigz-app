"use client";

import Image from "next/image";
import { EventItem } from "@/lib/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

// The tile behind Explore and an artist's show grid. Deliberately just a tile:
// liking and sharing live in the ticket sheet this opens, next to the show they
// act on, so every route into an event - Explore, This Week, For You - gets the
// same controls in the same place instead of each grid growing its own.
export default function EventCard({
  event,
  onOpen,
}: {
  event: EventItem;
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl text-left"
    >
      <Image src={event.image} alt={event.title} fill sizes="200px" className="object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <p className="font-display text-sm text-foreground line-clamp-1">{event.title}</p>
        <p className="text-xs text-muted">{formatDate(event.date)}</p>
      </div>
    </button>
  );
}
