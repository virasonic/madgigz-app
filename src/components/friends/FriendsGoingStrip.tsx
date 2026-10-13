"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Avatar from "@/components/ui/Avatar";
import { createClient } from "@/lib/supabase/client";
import {
  ActivityKind,
  FanCard,
  describeFriendsAtEvent,
  fetchFanCards,
  fetchFriendActivity,
  splitByKind,
} from "@/lib/friends";
import { useT } from "@/lib/i18n/LocaleProvider";

interface Line {
  kind: ActivityKind;
  friends: FanCard[];
}

// The social proof on a show (#149): which of YOUR friends are going, are
// interested, or were there. Rendered inside the ticket sheet, because that is
// the one place every route into an event converges. Nothing for guests, and
// nothing at all until the person has at least one friend on the show, so the
// sheet looks exactly as before for everyone else.
export default function FriendsGoingStrip({
  eventId,
  isGuest = false,
}: {
  eventId: string;
  isGuest?: boolean;
}) {
  const { t } = useT();
  const [lines, setLines] = useState<Line[]>([]);

  useEffect(() => {
    if (isGuest) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const rows = await fetchFriendActivity(supabase, [eventId]);
      if (rows.length === 0) return;
      const byKind = splitByKind(rows);
      const ids = [...byKind.going, ...byKind.interested, ...byKind.been];
      const cards = await fetchFanCards(supabase, ids);
      if (cancelled) return;
      const next: Line[] = (["going", "interested", "been"] as ActivityKind[])
        .map((kind) => ({
          kind,
          friends: byKind[kind].map((id) => cards[id]).filter((c): c is FanCard => Boolean(c)),
        }))
        .filter((l) => l.friends.length > 0);
      setLines(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, isGuest]);

  if (lines.length === 0) return null;

  const faces = lines.flatMap((l) => l.friends).slice(0, 4);

  return (
    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-primary/35 bg-background px-3.5 py-2.5">
      <div className="flex shrink-0">
        {faces.map((f, i) => (
          <Link
            key={f.id}
            href={`/profile/${f.username}`}
            className={`rounded-full ring-2 ring-background ${i > 0 ? "-ml-2.5" : ""}`}
            aria-label={f.username}
          >
            <Avatar photoUrl={f.photoUrl} name={f.username} size={30} />
          </Link>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        {lines.map((l) => (
          <p
            key={l.kind}
            className={`truncate ${l.kind === "going" ? "font-heading text-sm text-foreground" : "text-xs text-muted"}`}
          >
            {describeFriendsAtEvent(
              l.friends.map((f) => f.username),
              l.kind,
              t
            )}
          </p>
        ))}
      </div>
    </div>
  );
}
