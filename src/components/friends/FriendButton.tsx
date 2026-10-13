"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  acceptFriendRequest,
  removeFriend,
  sendFriendRequest,
} from "@/app/(app)/friends/actions";
import { useGuestGate } from "@/components/auth/GuestGate";
import { useT } from "@/lib/i18n/LocaleProvider";
import type { FriendStatus } from "@/lib/friends";

// One control for every place a fan meets another fan (#149): their profile
// card, a search result, a suggestion, a request row. It renders the right
// verb for the relationship and moves it forward optimistically.
export default function FriendButton({
  otherId,
  status: initialStatus,
  isGuest = false,
  size = "md",
}: {
  otherId: string;
  status: FriendStatus;
  isGuest?: boolean;
  size?: "sm" | "md";
}) {
  const { t } = useT();
  const router = useRouter();
  const { promptSignup, sheet } = useGuestGate();
  const [status, setStatus] = useState<FriendStatus>(initialStatus);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const pad = size === "sm" ? "px-3.5 py-1.5 text-xs" : "px-4 py-2 text-sm";
  const solid = `rounded-full bg-primary font-heading text-foreground disabled:opacity-60 ${pad}`;
  const ghost = `rounded-full border border-muted/40 font-heading text-foreground disabled:opacity-60 ${pad}`;
  const quiet = `rounded-full border border-muted/40 font-heading text-muted disabled:opacity-60 ${pad}`;

  function run(next: FriendStatus, action: () => Promise<{ ok: boolean; error?: string }>) {
    const previous = status;
    setStatus(next);
    setError(null);
    setConfirmRemove(false);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setStatus(previous);
        setError(t("friends.failed"));
        return;
      }
      router.refresh();
    });
  }

  function add() {
    if (isGuest) {
      promptSignup();
      return;
    }
    run("pending_out", () => sendFriendRequest(otherId));
  }

  let control: React.ReactNode;
  switch (status) {
    case "none":
      control = (
        <button type="button" onClick={add} disabled={isPending} className={solid}>
          {t("friends.addFriend")}
        </button>
      );
      break;
    case "pending_out":
      control = (
        <button
          type="button"
          onClick={() => run("none", () => removeFriend(otherId))}
          disabled={isPending}
          className={quiet}
          title={t("friends.cancelRequest")}
        >
          {t("friends.requested")}
        </button>
      );
      break;
    case "pending_in":
      control = (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => run("friends", () => acceptFriendRequest(otherId))}
            disabled={isPending}
            className={solid}
          >
            {t("friends.accept")}
          </button>
          <button
            type="button"
            onClick={() => run("none", () => removeFriend(otherId))}
            disabled={isPending}
            className={quiet}
          >
            {t("friends.decline")}
          </button>
        </div>
      );
      break;
    case "friends":
      control = confirmRemove ? (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => run("none", () => removeFriend(otherId))}
            disabled={isPending}
            className={`${quiet} text-danger`}
          >
            {t("friends.removeFriend")}
          </button>
          <button type="button" onClick={() => setConfirmRemove(false)} className={quiet}>
            {t("common.cancel")}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmRemove(true)}
          disabled={isPending}
          className={`${ghost} inline-flex items-center gap-1.5`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12l5 5 9-10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t("friends.friendsLabel")}
        </button>
      );
      break;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {control}
      {error && <span className="text-xs text-danger">{error}</span>}
      {sheet}
    </div>
  );
}
