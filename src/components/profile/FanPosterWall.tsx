"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { EventItem } from "@/lib/types";

// #201 poster-wall collage. A measured masonry: each poster spans 1 or 2 grid
// columns (so some are big, some small - the "dynamic" Vir wanted from the
// vintage-poster murals) and its ROW span is computed from the poster's real
// aspect ratio, so it's shown at its true shape with no crop (a tall poster
// stays tall, a wide one wide). `grid-auto-flow: dense` tessellates the big and
// small tiles together so it reads as one packed wall. A faint tilt nods to the
// street fly-poster look without the tap-breaking overlap.
const COLLAGE_GAP = 4; // px, matches the grid's gap-1
const COLLAGE_ROW = 8; // px, the grid-auto-rows unit a tile's height rounds to
const COLLAGE_TILTS = ["-rotate-1", "rotate-1", "rotate-0", "rotate-[0.5deg]", "-rotate-[0.5deg]"];

function collageColumns(n: number): number {
  if (n <= 1) return 1;
  if (n <= 3) return 2;
  if (n <= 8) return 3;
  return 4;
}
// Newest is a big (2-col) feature; then a sparse rhythm of big tiles among the
// small (1-col) ones. Capped at the column count so it can't overflow the grid.
function collageColSpan(i: number, cols: number): number {
  if (cols < 2) return 1;
  return Math.min(cols, i === 0 || i % 4 === 2 ? 2 : 1);
}

function CollageItem({
  event,
  colSpan,
  colWidth,
  tilt,
}: {
  event: EventItem;
  colSpan: number;
  colWidth: number;
  tilt: string;
}) {
  // Assume a portrait poster (3:4) until the image loads and we know its real
  // aspect, then derive the row-span so the tile matches the poster's shape.
  const [aspect, setAspect] = useState<number | null>(null);
  const tileWidth = colSpan * colWidth + (colSpan - 1) * COLLAGE_GAP;
  const ratio = aspect ?? 4 / 3;
  const tileHeight = tileWidth > 0 ? tileWidth * ratio : 0;
  const rowSpan = Math.max(1, Math.round((tileHeight + COLLAGE_GAP) / (COLLAGE_ROW + COLLAGE_GAP)));
  return (
    <Link
      href={`/e/${event.id}`}
      style={{ gridColumn: `span ${colSpan}`, gridRow: `span ${rowSpan}` }}
      className={`group block overflow-hidden rounded-sm bg-surface transition-transform duration-150 hover:z-10 hover:rotate-0 hover:scale-[1.04] ${tilt}`}
    >
      {event.image ? (
        // Plain img (not next/image): arbitrary Storage URLs shown at their
        // natural aspect, which next/image's fixed-size/fill model doesn't fit.
        // The tile's own height tracks the aspect, so object-cover shows the
        // whole poster (any crop is sub-pixel rounding).
        // eslint-disable-next-line @next/next/no-img-element -- natural-aspect poster, see note
        <img
          src={event.image}
          alt={event.title}
          loading="lazy"
          onLoad={(e) => setAspect(e.currentTarget.naturalHeight / e.currentTarget.naturalWidth)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-2 text-center">
          <span className="line-clamp-3 font-heading text-xs text-muted">{event.title}</span>
        </div>
      )}
    </Link>
  );
}

export function PosterCollage({ events }: { events: EventItem[] }) {
  // Measure the grid's own width so a tile's pixel height can be derived from
  // its aspect ratio. ResizeObserver (not a layout effect) keeps the setState
  // out of the effect body; a sensible default avoids a first-paint collapse.
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(384);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const cols = collageColumns(events.length);
  const colWidth = (width - (cols - 1) * COLLAGE_GAP) / cols;
  return (
    <div
      ref={ref}
      className="mt-3 grid gap-1 [grid-auto-flow:dense]"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridAutoRows: `${COLLAGE_ROW}px` }}
    >
      {events.map((event, i) => (
        <CollageItem
          key={event.id}
          event={event}
          colSpan={collageColSpan(i, cols)}
          colWidth={colWidth}
          tilt={COLLAGE_TILTS[i % COLLAGE_TILTS.length]}
        />
      ))}
    </div>
  );
}

// A poster "collage" of the fan's shows - the attended memories wall (#116) and
// the upcoming-saved grid (#180) share this renderer. Newest first, then packed
// into the measured masonry above.
export function FanPosterGrid({
  title,
  subtitle,
  events,
  action,
}: {
  title: string;
  subtitle: string;
  events: EventItem[];
  /** Optional control beside the heading - the story export button (#228). */
  action?: React.ReactNode;
}) {
  const ordered = [...events].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="mb-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-sm uppercase tracking-wide text-muted">{title}</h2>
          <p className="mt-1 text-xs text-muted">{subtitle}</p>
        </div>
        {action}
      </div>
      <PosterCollage events={ordered} />
    </div>
  );
}
