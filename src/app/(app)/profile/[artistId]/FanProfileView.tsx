"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Avatar from "@/components/ui/Avatar";
import BackButton from "@/components/ui/BackButton";
import EventCard from "@/components/feed/EventCard";
import TicketModal from "@/components/feed/TicketModal";
import FriendButton from "@/components/friends/FriendButton";
import FanPhotoStrip from "@/components/fan-photos/FanPhotoStrip";
import type { FanPhoto } from "@/lib/fan-photos";
import { createClient } from "@/lib/supabase/client";
import { toggleSavedEvent } from "@/lib/supabase/queries";
import { useUrlModal } from "@/lib/useUrlModal";
import { useT } from "@/lib/i18n/LocaleProvider";
import { dateLocale } from "@/lib/dates";
import { EventItem } from "@/lib/types";
import { ActivityKind, FanCard, FriendStatus } from "@/lib/friends";

type Tab = ActivityKind;

// A fan's page (#149). To a friend: their going / interested / been shows. To
// anyone else: avatar, username and the friend button - nothing more, by
// design. Guests see the same minimal card, with the button as the sign-up
// prompt, so an invite link from a QR or a share works cold.
export default function FanProfileView({
  card,
  status,
  since,
  isGuest,
  userId,
  events,
  myGoingIds,
  initialSavedIds,
  photos,
}: {
  card: FanCard;
  status: FriendStatus;
  since: string | null;
  isGuest: boolean;
  userId: string | null;
  /** Present only when the viewer is a friend. */
  events: Record<Tab, EventItem[]> | null;
  myGoingIds: string[];
  initialSavedIds: string[];
  /** Their approved fan photos; only passed for a friend. */
  photos: FanPhoto[];
}) {
  const { t, locale } = useT();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("going");

  // A logged-out visitor opening a fan's page got here from that fan's invite
  // link or QR (#149). Remember who, so after they sign up the Find friends
  // screen can suggest the person who brought them in. Per-device only.
  useEffect(() => {
    if (!isGuest) return;
    try {
      localStorage.setItem("mg_invite_ref", card.username);
    } catch {
      // storage unavailable (private mode) - the suggestion just won't appear
    }
  }, [isGuest, card.username]);
  const [savedIds, setSavedIds] = useState<string[]>(initialSavedIds);
  const ticketModal = useUrlModal("ticket");
  const allShows = useMemo(
    () => (events ? [...events.going, ...events.interested, ...events.been] : []),
    [events]
  );
  const activeEvent = useMemo(
    () => allShows.find((s) => s.id === ticketModal.value) ?? null,
    [allShows, ticketModal.value]
  );

  async function handleToggleSave(eventId: string) {
    if (!userId) return;
    const wasSaved = savedIds.includes(eventId);
    setSavedIds((ids) => (wasSaved ? ids.filter((id) => id !== eventId) : [...ids, eventId]));
    const ok = await toggleSavedEvent(createClient(), userId, eventId, wasSaved);
    if (!ok) {
      setSavedIds((ids) => (wasSaved ? [...ids, eventId] : ids.filter((id) => id !== eventId)));
      return;
    }
    router.refresh();
  }

  const sinceLabel =
    since &&
    new Date(since).toLocaleDateString(dateLocale(locale), { month: "short", year: "numeric" });

  const tabs: { key: Tab; label: string; count: number }[] = events
    ? [
        { key: "going", label: t("friends.tabGoing"), count: events.going.length },
        { key: "interested", label: t("friends.tabInterested"), count: events.interested.length },
        { key: "been", label: t("friends.tabBeen"), count: events.been.length },
      ]
    : [];

  const emptyKey: Record<Tab, string> = {
    going: "friends.nothingGoing",
    interested: "friends.nothingInterested",
    been: "friends.nothingBeen",
  };

  return (
    <div className="p-4 lg:mx-auto lg:max-w-2xl">
      <BackButton className="mb-4" fallbackHref="/friends" />

      <div className="flex flex-col items-center gap-3 text-center">
        <Avatar photoUrl={card.photoUrl} name={card.username} size={88} />
        <div>
          <h1 className="font-display text-2xl text-foreground">{card.username}</h1>
          <p className="mt-1 text-xs text-muted">
            {status === "friends" && sinceLabel
              ? t("friends.friendsSince", { date: sinceLabel })
              : t("friends.fanRole")}
          </p>
        </div>
        <FriendButton otherId={card.id} status={status} isGuest={isGuest} />
      </div>

      {events ? (
        <>
          <div className="mt-6 flex gap-1 rounded-full bg-surface p-1">
            {tabs.map((tb) => (
              <button
                key={tb.key}
                type="button"
                onClick={() => setTab(tb.key)}
                aria-pressed={tab === tb.key}
                className={`flex-1 whitespace-nowrap rounded-full px-1 py-2 text-xs font-heading sm:text-sm ${
                  tab === tb.key ? "bg-surface-raised text-foreground" : "text-muted"
                }`}
              >
                {tb.label} · {tb.count}
              </button>
            ))}
          </div>

          <FanPhotoStrip photos={photos} className="mt-6" />

          {events[tab].length === 0 ? (
            <p className="mt-6 text-center text-sm text-muted">{t(emptyKey[tab])}</p>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {events[tab].map((show) => (
                <div key={show.id} className="relative">
                  <EventCard event={show} onOpen={() => ticketModal.open(show.id)} />
                  {tab !== "been" && myGoingIds.includes(show.id) && (
                    <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-heading text-foreground">
                      {t("friends.youreGoingToo")}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="mt-8 text-center text-sm text-muted">
          {isGuest
            ? t("friends.guestBody", { username: card.username })
            : t("friends.notFriendsBody", { username: card.username })}
        </p>
      )}

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
    </div>
  );
}
