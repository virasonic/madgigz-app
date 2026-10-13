"use client";

import Link from "next/link";
import { useState } from "react";
import { EventItem } from "@/lib/types";
import { useT } from "@/lib/i18n/LocaleProvider";
import FriendsGoingStrip from "./FriendsGoingStrip";
import SendToFriendSheet from "./SendToFriendSheet";

// The moment right after buying is the highest-intent moment to recruit
// company (#149 Phase B): who's already in, invite more, and when more than one
// ticket was bought, the route to handing a spare on. Shared by the free-ticket
// success screen in the ticket sheet and the paid /checkout/complete page so
// the two stay identical.
export default function PostPurchaseActions({
  event,
  quantity,
}: {
  event: EventItem;
  quantity: number;
}) {
  const { t } = useT();
  const [inviting, setInviting] = useState(false);

  return (
    <div className="w-full">
      <FriendsGoingStrip eventId={event.id} />
      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setInviting(true)}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 font-display text-base text-foreground"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="10" cy="8" r="3.5" stroke="currentColor" strokeWidth="2" />
            <path d="M3 20a7 7 0 0 1 14 0M19 8v6M16 11h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {t("friends.inviteFriends")}
        </button>
        {quantity > 1 && (
          <Link
            href="/saved"
            className="flex w-full items-center justify-center gap-2 rounded-full bg-accent-dark px-6 py-3.5 font-display text-base text-foreground"
          >
            {t("friends.sendSpare")}
          </Link>
        )}
      </div>
      {inviting && <SendToFriendSheet mode="event" event={event} onClose={() => setInviting(false)} />}
    </div>
  );
}
