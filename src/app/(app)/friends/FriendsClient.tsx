"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import Avatar from "@/components/ui/Avatar";
import EventCard from "@/components/feed/EventCard";
import TicketModal from "@/components/feed/TicketModal";
import FriendButton from "@/components/friends/FriendButton";
import { createClient } from "@/lib/supabase/client";
import { toggleSavedEvent } from "@/lib/supabase/queries";
import { useUrlModal } from "@/lib/useUrlModal";
import { useT } from "@/lib/i18n/LocaleProvider";
import { EventItem } from "@/lib/types";
import { FriendActivity, FriendLink, splitByKind } from "@/lib/friends";
import { setShareInterested } from "./actions";

export default function FriendsClient({
  userId,
  username,
  links,
  activity,
  events,
  initialSavedIds,
  initialShareInterested,
}: {
  userId: string;
  username: string;
  links: FriendLink[];
  activity: FriendActivity[];
  events: EventItem[];
  initialSavedIds: string[];
  initialShareInterested: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const [savedIds, setSavedIds] = useState<string[]>(initialSavedIds);
  const ticketModal = useUrlModal("ticket");
  const activeEvent = useMemo(
    () => events.find((e) => e.id === ticketModal.value) ?? null,
    [events, ticketModal.value]
  );

  const friends = links.filter((l) => l.status === "friends");
  const requestsIn = links.filter((l) => l.status === "pending_in");
  const requestsOut = links.filter((l) => l.status === "pending_out");
  const cardById = useMemo(
    () => Object.fromEntries(links.map((l) => [l.profile.id, l.profile])),
    [links]
  );

  // Per-show friends, each friend once (going beats interested), for the rail.
  const byEvent = useMemo(() => {
    const map = new Map<string, FriendActivity[]>();
    for (const a of activity) map.set(a.eventId, [...(map.get(a.eventId) ?? []), a]);
    return map;
  }, [activity]);

  // Per-friend counts for the list sublines.
  const counts = useMemo(() => {
    const out: Record<string, { going: number; been: number }> = {};
    const seen = new Set<string>();
    for (const a of activity) {
      const key = `${a.friendId}:${a.eventId}:${a.kind}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const c = (out[a.friendId] ??= { going: 0, been: 0 });
      if (a.kind === "going") c.going += 1;
      else if (a.kind === "been") c.been += 1;
    }
    return out;
  }, [activity]);

  const [shareInterested, setShare] = useState(initialShareInterested);
  const [savingShare, startShare] = useTransition();
  function toggleShare() {
    const next = !shareInterested;
    setShare(next);
    startShare(async () => {
      const r = await setShareInterested(next);
      if (!r.ok) setShare(!next);
    });
  }

  async function handleToggleSave(eventId: string) {
    const wasSaved = savedIds.includes(eventId);
    setSavedIds((ids) => (wasSaved ? ids.filter((id) => id !== eventId) : [...ids, eventId]));
    const ok = await toggleSavedEvent(createClient(), userId, eventId, wasSaved);
    if (!ok) {
      setSavedIds((ids) => (wasSaved ? [...ids, eventId] : ids.filter((id) => id !== eventId)));
      return;
    }
    router.refresh();
  }

  const findLink = (
    <Link
      href="/friends/find"
      aria-label={t("friends.find")}
      className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-raised text-foreground"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="10" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8" />
        <path d="M3 20a7 7 0 0 1 14 0M19 8v6M16 11h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </Link>
  );

  return (
    <div className="p-4 lg:mx-auto lg:max-w-2xl">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="font-display text-2xl text-foreground">{t("friends.title")}</h1>
        {findLink}
      </div>

      {requestsIn.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 font-heading text-sm text-muted">
            {t("friends.requests")} · {requestsIn.length}
          </h2>
          <div className="flex flex-col gap-2">
            {requestsIn.map((l) => (
              <div key={l.profile.id} className="flex items-center gap-3 rounded-2xl bg-surface p-3">
                <Link href={`/profile/${l.profile.username}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar photoUrl={l.profile.photoUrl} name={l.profile.username} size={44} />
                  <span className="truncate font-heading text-sm text-foreground">{l.profile.username}</span>
                </Link>
                <FriendButton otherId={l.profile.id} status="pending_in" size="sm" />
              </div>
            ))}
          </div>
        </section>
      )}

      {events.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 font-heading text-sm text-muted">{t("friends.goingSoon")}</h2>
          <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4">
            {events.map((event) => {
              const split = splitByKind(byEvent.get(event.id) ?? []);
              const faces = [...split.going, ...split.interested]
                .map((id) => cardById[id])
                .filter(Boolean)
                .slice(0, 3);
              return (
                <div key={event.id} className="w-36 shrink-0">
                  <EventCard event={event} onOpen={() => ticketModal.open(event.id)} />
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex">
                      {faces.map((f, i) => (
                        <span key={f.id} className={`rounded-full ring-2 ring-background ${i > 0 ? "-ml-2" : ""}`}>
                          <Avatar photoUrl={f.photoUrl} name={f.username} size={22} />
                        </span>
                      ))}
                    </div>
                    <span className="truncate text-xs text-muted">
                      {split.going.length > 0
                        ? t("friends.countGoing", { count: split.going.length })
                        : t("friends.countInterested", { count: split.interested.length })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="mb-6">
        <h2 className="mb-1 font-heading text-sm text-muted">
          {t("friends.yourFriends")}
          {friends.length > 0 ? ` · ${friends.length}` : ""}
        </h2>
        {friends.length === 0 ? (
          <div className="rounded-2xl bg-surface p-4">
            <p className="font-heading text-sm text-foreground">{t("friends.noFriendsTitle")}</p>
            <p className="mt-1 text-sm text-muted">{t("friends.noFriendsBody")}</p>
            <Link
              href="/friends/find"
              className="mt-3 inline-block rounded-full bg-primary px-5 py-2 text-sm font-heading text-foreground"
            >
              {t("friends.find")}
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col">
            {friends.map((l) => {
              const c = counts[l.profile.id] ?? { going: 0, been: 0 };
              return (
                <li key={l.profile.id} className="border-b border-muted/10 last:border-b-0">
                  <Link href={`/profile/${l.profile.username}`} className="flex items-center gap-3 py-2.5">
                    <Avatar photoUrl={l.profile.photoUrl} name={l.profile.username} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-heading text-sm text-foreground">{l.profile.username}</span>
                      <span className="block text-xs text-muted">
                        {t("friends.friendSubline", { going: c.going, been: c.been })}
                      </span>
                    </span>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-muted">
                      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {requestsOut.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 font-heading text-sm text-muted">{t("friends.sent")}</h2>
          <div className="flex flex-col">
            {requestsOut.map((l) => (
              <div key={l.profile.id} className="flex items-center gap-3 border-b border-muted/10 py-2.5 last:border-b-0">
                <Avatar photoUrl={l.profile.photoUrl} name={l.profile.username} size={40} />
                <span className="min-w-0 flex-1 truncate font-heading text-sm text-foreground">{l.profile.username}</span>
                <FriendButton otherId={l.profile.id} status="pending_out" size="sm" />
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl bg-surface p-4">
        <label className="flex items-start justify-between gap-4">
          <span>
            <span className="block font-heading text-sm text-foreground">{t("friends.privacyTitle")}</span>
            <span className="mt-1 block text-xs text-muted">{t("friends.privacyBody")}</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={shareInterested}
            onClick={toggleShare}
            disabled={savingShare}
            className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition-colors ${
              shareInterested ? "bg-primary" : "bg-muted/30"
            }`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-foreground transition-transform ${
                shareInterested ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </label>
        <p className="mt-3 text-xs text-muted">{t("friends.youAre", { username })}</p>
      </section>

      {activeEvent && (
        <TicketModal
          key={activeEvent.id}
          event={activeEvent}
          liked={savedIds.includes(activeEvent.id)}
          onToggleLike={() => handleToggleSave(activeEvent.id)}
          onClose={ticketModal.close}
        />
      )}
    </div>
  );
}
