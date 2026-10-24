"use client";

import Image from "next/image";
import { EventItem } from "@/lib/types";
import { useT } from "@/lib/i18n/LocaleProvider";
import { dateLocale } from "@/lib/dates";

function formatDate(iso: string, dl: string) {
  return new Date(iso).toLocaleDateString(dl, {
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
  const { t, locale } = useT();
  return (
    <button
      onClick={onOpen}
      className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl text-left transition-transform duration-150 hover:scale-[1.02]"
    >
      {/* A show with no poster yet (seeded or admin-created without an image)
          gets its accent colour as the tile rather than the browser's broken-
          image glyph over a black square. */}
      {event.image ? (
        <Image src={event.image} alt={event.title} fill sizes="200px" className="object-cover" />
      ) : (
        <div aria-hidden="true" className="absolute inset-0" style={{ backgroundColor: event.accentColor }} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
      {/* #217: an editorially featured show. Sits top-left, above the gradient
          but clear of the title block, and reads on a poster of any colour
          because it carries its own solid background. */}
      {event.featured && (
        <span className="absolute left-2 top-2 rounded-full bg-primary px-2 py-0.5 text-[10px] font-heading uppercase tracking-wide text-foreground">
          {t("explore.featuredBadge")}
        </span>
      )}
      <div className="absolute bottom-0 left-0 right-0 p-3">
        <p className="font-display text-sm text-foreground line-clamp-1">{event.title}</p>
        <p className="text-xs text-muted">{formatDate(event.date, dateLocale(locale))}</p>
      </div>
    </button>
  );
}
