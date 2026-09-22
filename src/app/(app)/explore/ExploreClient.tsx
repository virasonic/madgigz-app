"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import EventCard from "@/components/feed/EventCard";
import TicketModal from "@/components/feed/TicketModal";
import Avatar from "@/components/ui/Avatar";
import { useGuestGate } from "@/components/auth/GuestGate";
import { createClient } from "@/lib/supabase/client";
import { toggleSavedEvent } from "@/lib/supabase/queries";
import { EventItem, PublicArtistProfile } from "@/lib/types";
import { scoreEvent, type FanPreferences } from "@/lib/fan-preferences";
import { useUrlModal } from "@/lib/useUrlModal";
import { useT } from "@/lib/i18n/LocaleProvider";
import CityBadge from "@/components/ui/CityBadge";

interface ExploreClientProps {
  /** Null for a logged-out guest browsing Explore. */
  userId: string | null;
  initialEvents: EventItem[];
  initialSavedIds: string[];
  artists: PublicArtistProfile[];
  /** Promoters and venues (#88) - searchable alongside artists. */
  proAccounts: PublicArtistProfile[];
  genresByEvent: Record<string, string[]>;
  genreIdsByEvent: Record<string, string[]>;
  followedEventIds: string[];
  preferences: FanPreferences;
}

export default function ExploreClient({
  userId,
  initialEvents,
  initialSavedIds,
  artists,
  proAccounts,
  genresByEvent,
  genreIdsByEvent,
  followedEventIds,
  preferences,
}: ExploreClientProps) {
  const { t } = useT();
  const router = useRouter();
  const { promptSignup, sheet: guestSheet } = useGuestGate();
  const [savedIds, setSavedIds] = useState<string[]>(initialSavedIds);
  // #102: the open ticket sheet lives in ?ticket=<id> so back closes it and the
  // link is shareable. Resolved from the param against the events on this page.
  const ticketModal = useUrlModal("ticket");
  const activeEvent = useMemo(
    () => initialEvents.find((e) => e.id === ticketModal.value) ?? null,
    [initialEvents, ticketModal.value]
  );
  // The desktop SideNav search hands off here via ?q. Seed the box from it, and
  // re-sync when the param changes (searching again from the rail while already
  // on Explore doesn't remount this) using React's adjust-state-during-render
  // pattern rather than an effect - see the setState-in-effect note in CLAUDE.md.
  // Typing in the box only touches local state, so it's never clobbered.
  const qParam = useSearchParams().get("q") ?? "";
  const [query, setQuery] = useState(qParam);
  const [seenQ, setSeenQ] = useState(qParam);
  if (qParam !== seenQ) {
    setSeenQ(qParam);
    setQuery(qParam);
  }
  const [activeGenre, setActiveGenre] = useState<string | null>(null);

  // Only genres actually on a live show - a filter chip that returns nothing is
  // worse than no chip.
  const availableGenres = useMemo(() => {
    const names = new Set<string>();
    initialEvents.forEach((e) => (genresByEvent[e.id] ?? []).forEach((g) => names.add(g)));
    return [...names].sort();
  }, [initialEvents, genresByEvent]);

  const trimmedQuery = query.trim().toLowerCase();

  const followed = useMemo(() => new Set(followedEventIds), [followedEventIds]);

  const filteredEvents = useMemo(() => {
    let list = initialEvents;
    if (activeGenre) {
      list = list.filter((event) => (genresByEvent[event.id] ?? []).includes(activeGenre));
    }
    if (trimmedQuery) {
      list = list.filter((event) =>
        [event.title, event.artist, event.venue, ...(genresByEvent[event.id] ?? [])]
          .join(" ")
          .toLowerCase()
          .includes(trimmedQuery)
      );
    }
    // Artists you follow float to the top, then shows matching your preferences
    // (#170) float up within the rest. Explore is discovery rather than a
    // schedule, so unlike This Week it can afford to break date order - and a
    // stable sort keeps everything else in the date order it arrived in. A fan
    // with no preferences scores 0 everywhere, so this is a no-op for them.
    return [...list].sort((a, b) => {
      const byFollowed = Number(followed.has(b.id)) - Number(followed.has(a.id));
      if (byFollowed !== 0) return byFollowed;
      const scoreA = scoreEvent(preferences, {
        genreIds: genreIdsByEvent[a.id] ?? [],
        dateIso: a.date,
        timeStr: a.time,
        capacity: a.capacity,
      });
      const scoreB = scoreEvent(preferences, {
        genreIds: genreIdsByEvent[b.id] ?? [],
        dateIso: b.date,
        timeStr: b.time,
        capacity: b.capacity,
      });
      return scoreB - scoreA;
    });
  }, [initialEvents, trimmedQuery, activeGenre, genresByEvent, genreIdsByEvent, followed, preferences]);

  // Artists only appear once someone searches - listing every artist above the
  // grid by default would bury the shows Explore exists to surface.
  const filteredArtists = useMemo(() => {
    if (!trimmedQuery) return [];
    return artists.filter((artist) =>
      [artist.artistName, artist.username].join(" ").toLowerCase().includes(trimmedQuery)
    );
  }, [artists, trimmedQuery]);

  // Promoters and venues (#88), same match rule as artists. Shown in their own
  // section so a venue isn't filed under "Artists".
  const filteredPros = useMemo(() => {
    if (!trimmedQuery) return [];
    return proAccounts.filter((pro) =>
      [pro.artistName, pro.username].join(" ").toLowerCase().includes(trimmedQuery)
    );
  }, [proAccounts, trimmedQuery]);

  async function handleToggleSave(eventId: string) {
    // Guests can browse but not save - the tap becomes the sign-up prompt.
    if (!userId) {
      promptSignup();
      return;
    }
    const wasSaved = savedIds.includes(eventId);
    setSavedIds((ids) => (wasSaved ? ids.filter((id) => id !== eventId) : [...ids, eventId]));
    const supabase = createClient();
    const ok = await toggleSavedEvent(supabase, userId, eventId, wasSaved);
    if (!ok) {
      setSavedIds((ids) => (wasSaved ? [...ids, eventId] : ids.filter((id) => id !== eventId)));
      return;
    }
    // #185: the save is a client-only write, so the profile's Saved grid/count
    // (server-rendered) would show a stale value for up to 30s (staleTimes). A
    // refresh invalidates the client router cache so the next visit re-fetches.
    router.refresh();
  }

  return (
    <div className="lg:mx-auto lg:max-w-5xl">
      {/* #106: the title, search and genre chips are pinned so they stay
          reachable while the grid scrolls beneath. bg-background is opaque, so
          it covers the event cards passing under it; z-20 keeps it on top. */}
      <div className="sticky top-0 z-20 bg-background px-4 pt-4 pb-2">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="font-display text-2xl text-foreground">{t("explore.title")}</h1>
          <CityBadge />
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("explore.searchPlaceholder")}
          className="mb-4 w-full rounded-2xl border border-muted/20 bg-surface px-4 py-3 text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
        />

        {availableGenres.length > 0 && (
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {availableGenres.map((genre) => (
              <button
                key={genre}
                onClick={() => setActiveGenre((current) => (current === genre ? null : genre))}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-heading transition-colors ${
                  activeGenre === genre
                    ? "bg-primary text-foreground"
                    : "bg-surface text-muted"
                }`}
              >
                {genre}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 pb-4">
      {filteredArtists.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 font-heading text-sm uppercase tracking-wide text-muted">{t("explore.artistsHeading")}</h2>
          <div className="flex flex-col gap-2">
            {filteredArtists.map((artist) => (
              <Link
                key={artist.id}
                href={`/profile/${artist.id}`}
                className="flex items-center gap-3 rounded-2xl bg-surface p-3"
              >
                <Avatar photoUrl={artist.artistPhotoUrl} name={artist.artistName} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-heading text-sm text-foreground">
                    {artist.artistName}
                  </p>
                  {/* artistName falls back to username when an artist never set
                      one, so without this the same string renders twice. */}
                  {artist.artistName !== artist.username && (
                    <p className="truncate text-xs text-muted">@{artist.username}</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {filteredPros.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 font-heading text-sm uppercase tracking-wide text-muted">
            {t("explore.organisersHeading")}
          </h2>
          <div className="flex flex-col gap-2">
            {filteredPros.map((pro) => (
              <Link
                key={pro.id}
                href={`/profile/${pro.id}`}
                className="flex items-center gap-3 rounded-2xl bg-surface p-3"
              >
                <Avatar photoUrl={pro.artistPhotoUrl} name={pro.artistName} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-heading text-sm text-foreground">{pro.artistName}</p>
                  {pro.artistName !== pro.username && (
                    <p className="truncate text-xs text-muted">@{pro.username}</p>
                  )}
                </div>
                {/* Which kind of organiser, so a venue reads as a venue and not
                    an act. proType is always set on a pro row. */}
                <span className="shrink-0 rounded-full bg-background px-2.5 py-1 text-[11px] font-heading text-muted">
                  {pro.proType === "venue"
                    ? t("profile.publicRoleVenue")
                    : t("profile.publicRolePromoter")}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {filteredEvents.length > 0 && (
        <>
          {(filteredArtists.length > 0 || filteredPros.length > 0) && (
            <h2 className="mb-3 font-heading text-sm uppercase tracking-wide text-muted">{t("explore.eventsHeading")}</h2>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filteredEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                onOpen={() => ticketModal.open(event.id)}
              />
            ))}
          </div>
        </>
      )}

      {filteredEvents.length === 0 && filteredArtists.length === 0 && filteredPros.length === 0 && (
        <p className="text-sm text-muted">
          {trimmedQuery ? t("explore.noResults") : t("explore.noEvents")}
        </p>
      )}
      </div>

      {activeEvent && (
        <TicketModal
          key={activeEvent.id}
          event={activeEvent}
          isGuest={!userId}
          liked={savedIds.includes(activeEvent.id)}
          onToggleLike={() => handleToggleSave(activeEvent.id)}
          onClose={ticketModal.close}
        />
      )}

      {guestSheet}
    </div>
  );
}
