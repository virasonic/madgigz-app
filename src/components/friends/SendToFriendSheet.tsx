"use client";

import { useEffect, useState } from "react";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { EventItem } from "@/lib/types";
import { shareEvent } from "@/lib/share";
import { useT } from "@/lib/i18n/LocaleProvider";
import { FriendLink, fetchFriendActivity, fetchFriendships, splitByKind } from "@/lib/friends";
import { offerTicketToFriend, sendEventToFriends } from "@/app/(app)/friends/send-actions";

type Props =
  | { mode: "event"; event: EventItem; onClose: () => void }
  | { mode: "ticket"; event: EventItem; token: string; onClose: () => void };

// #149 Phase B: the one in-app messaging primitive. A gig (with an optional
// note) or a spare ticket's claim link goes to chosen friends as a notification.
// Deliberately not a chat; there is nothing to reply to except by sending a gig
// back. The OS share sheet stays one tap away for everyone outside MadGigz.
export default function SendToFriendSheet(props: Props) {
  const { t } = useT();
  const { event, onClose, mode } = props;
  const [friends, setFriends] = useState<FriendLink[] | null>(null);
  const [status, setStatus] = useState<Record<string, "going" | "interested">>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [sentCount, setSentCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setFriends([]);
        return;
      }
      const [links, activity] = await Promise.all([
        fetchFriendships(supabase, user.id),
        fetchFriendActivity(supabase, [event.id]),
      ]);
      if (cancelled) return;
      setFriends(links.filter((l) => l.status === "friends"));
      const split = splitByKind(activity);
      const next: Record<string, "going" | "interested"> = {};
      for (const id of split.going) next[id] = "going";
      for (const id of split.interested) next[id] = "interested";
      setStatus(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [event.id]);

  function toggle(id: string) {
    if (mode === "ticket") {
      setSelected((s) => (s[0] === id ? [] : [id]));
      return;
    }
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  async function send() {
    if (selected.length === 0) return;
    setPhase("sending");
    if (mode === "ticket") {
      const r = await offerTicketToFriend(selected[0], props.token);
      setSentCount(r.ok ? 1 : 0);
      setPhase(r.ok ? "done" : "error");
      return;
    }
    const r = await sendEventToFriends(event.id, selected, note);
    setSentCount(r.sent);
    setPhase(r.ok ? "done" : "error");
  }

  async function shareOutside() {
    await shareEvent(event);
    onClose();
  }

  const title = mode === "ticket" ? t("friends.sendTicketTitle") : t("friends.sendTitle");
  const sendLabel =
    selected.length === 1 ? t("friends.sendToOne") : t("friends.sendTo", { count: selected.length });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={onClose}>
      <div
        role="dialog"
        aria-label={title}
        className="flex max-h-[88vh] w-full max-w-md flex-col rounded-t-3xl bg-surface p-6 pb-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 shrink-0 rounded-full bg-muted/30" />
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl text-foreground">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-raised text-muted"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-background p-3">
          <div
            className="h-14 w-11 shrink-0 rounded-lg bg-cover bg-center"
            style={{ backgroundColor: event.accentColor, backgroundImage: event.image ? `url(${event.image})` : undefined }}
          />
          <div className="min-w-0">
            <p className="truncate font-heading text-sm text-foreground">{event.title}</p>
            <p className="truncate text-xs text-muted">{event.venue}</p>
          </div>
        </div>

        {phase === "done" ? (
          <div className="mt-6 flex flex-col items-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M5 12l5 5 9-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-foreground" />
              </svg>
            </div>
            <p className="font-heading text-sm text-foreground">
              {mode === "ticket"
                ? t("friends.ticketSent")
                : sentCount === 1
                  ? t("friends.sentCountOne")
                  : t("friends.sentCount", { count: sentCount })}
            </p>
            <Button className="mt-2" onClick={onClose}>
              {t("common.done")}
            </Button>
          </div>
        ) : (
          <>
            {mode === "event" && (
              <div className="mt-4">
                <label htmlFor="send-note" className="mb-1.5 block font-heading text-xs text-muted">
                  {t("friends.noteLabel")}
                </label>
                <input
                  id="send-note"
                  type="text"
                  maxLength={140}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t("friends.notePlaceholder")}
                  className="w-full rounded-2xl border border-muted/20 bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            )}

            <div className="mt-4 flex items-center justify-between">
              <span className="font-heading text-xs text-muted">{t("friends.friendsLabel")}</span>
              {selected.length > 0 && (
                <span className="text-xs text-muted">{t("friends.selectedCount", { count: selected.length })}</span>
              )}
            </div>

            <div className="no-scrollbar mt-1 min-h-0 flex-1 overflow-y-auto">
              {friends === null ? (
                <div className="h-14 animate-pulse rounded-2xl bg-background" />
              ) : friends.length === 0 ? (
                <p className="py-4 text-sm text-muted">{t("friends.noFriendsToSend")}</p>
              ) : (
                friends.map((f) => {
                  const on = selected.includes(f.profile.id);
                  const sub = status[f.profile.id];
                  return (
                    <label
                      key={f.profile.id}
                      className="flex cursor-pointer items-center gap-3 border-b border-muted/10 py-2.5 last:border-b-0"
                    >
                      <input
                        type={mode === "ticket" ? "radio" : "checkbox"}
                        name="send-to"
                        checked={on}
                        onChange={() => toggle(f.profile.id)}
                        className="sr-only"
                      />
                      <Avatar photoUrl={f.profile.photoUrl} name={f.profile.username} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-heading text-sm text-foreground">{f.profile.username}</span>
                        {sub && (
                          <span className="block text-xs text-muted">
                            {sub === "going" ? t("friends.alreadyGoing") : t("friends.interestedSub")}
                          </span>
                        )}
                      </span>
                      <span
                        aria-hidden="true"
                        className={`flex h-6 w-6 items-center justify-center rounded-full ${
                          on ? "bg-primary" : "border border-muted/40"
                        }`}
                      >
                        {on && (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                            <path d="M5 12l5 5 9-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-foreground" />
                          </svg>
                        )}
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            {phase === "error" && <p className="mt-2 text-sm text-danger">{t("friends.failed")}</p>}

            <div className="mt-4 flex shrink-0 flex-col gap-2">
              <Button onClick={send} disabled={selected.length === 0 || phase === "sending"}>
                {phase === "sending" ? "…" : selected.length === 0 ? t("friends.send") : sendLabel}
              </Button>
              {mode === "event" && (
                <button
                  type="button"
                  onClick={shareOutside}
                  className="py-2 text-center text-sm font-heading text-muted"
                >
                  {t("friends.shareOutside")}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
