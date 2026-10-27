"use client";

import { useMemo, useState } from "react";
import ArtistShowsGrid from "./ArtistShowsGrid";
import ArtistContentGrid from "./ArtistContentGrid";
import FanPhotoStrip from "@/components/fan-photos/FanPhotoStrip";
import type { FanPhoto } from "@/lib/fan-photos";
import { ContentPost, EventItem } from "@/lib/types";
import { useT } from "@/lib/i18n/LocaleProvider";

// The lower half of an organiser's profile: Shows, the Content they've posted,
// and Fan photos - one of three tabs rather than three stacked sections, so a
// prolific artist's reels don't bury the shows a fan came to buy. The tab bar
// only appears when there's more than shows to show; a sparse profile is just
// its shows grid, exactly as before this existed.
type Tab = "shows" | "content" | "fanPhotos";

export default function ArtistProfileTabs({
  userId,
  upcoming,
  past,
  savedIds,
  contentPosts,
  contentEventMap,
  fanPhotos,
}: {
  userId: string | null;
  upcoming: EventItem[];
  past: EventItem[];
  savedIds: string[];
  contentPosts: ContentPost[];
  contentEventMap: Record<string, EventItem>;
  fanPhotos: FanPhoto[];
}) {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("shows");

  // A gig post needs its show present to open; an announcement doesn't. If
  // nothing's left there's no Content tab.
  const hasContent = useMemo(
    () => contentPosts.some((p) => (p.eventId ? Boolean(contentEventMap[p.eventId]) : true)),
    [contentPosts, contentEventMap]
  );
  const hasFanPhotos = fanPhotos.length > 0;

  const shows = (
    <ArtistShowsGrid userId={userId} upcoming={upcoming} past={past} initialSavedIds={savedIds} />
  );

  // Nothing but shows: skip the tab chrome entirely.
  if (!hasContent && !hasFanPhotos) return shows;

  const tabs: { key: Tab; label: string }[] = [
    { key: "shows", label: t("profile.tabShows") },
    ...(hasContent ? [{ key: "content" as Tab, label: t("profile.tabContent") }] : []),
    ...(hasFanPhotos ? [{ key: "fanPhotos" as Tab, label: t("profile.tabFanPhotos") }] : []),
  ];

  return (
    <div className="mt-6">
      <div role="tablist" className="flex border-b border-surface-raised">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`flex-1 py-2 text-center text-sm transition ${
              tab === key
                ? "border-b-2 border-primary font-heading text-foreground"
                : "text-muted hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="pt-1">
        {tab === "shows" && shows}
        {tab === "content" && (
          <ArtistContentGrid
            posts={contentPosts}
            eventMap={contentEventMap}
            userId={userId}
            initialSavedIds={savedIds}
          />
        )}
        {tab === "fanPhotos" && <FanPhotoStrip photos={fanPhotos} className="mt-4" />}
      </div>
    </div>
  );
}
