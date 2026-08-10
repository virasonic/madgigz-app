"use client";

import { useState, useTransition } from "react";
import { toggleFollow } from "@/app/(app)/profile/follow-actions";
import { useT } from "@/lib/i18n/LocaleProvider";

// No follower count here on purpose. It's an artist insight - shown to them on
// their own profile - not a public scoreboard. A new artist with three
// followers is not helped by every visitor seeing it, and a fan deciding
// whether to follow shouldn't be nudged by a popularity number.
export default function FollowButton({
  artistId,
  initialFollowing,
}: {
  artistId: string;
  initialFollowing: boolean;
}) {
  const { t } = useT();
  const [following, setFollowing] = useState(initialFollowing);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    // Optimistic: following should feel instant.
    const wasFollowing = following;
    setFollowing(!wasFollowing);
    setError(null);

    startTransition(async () => {
      const result = await toggleFollow(artistId, wasFollowing);
      if (result.error) {
        setFollowing(wasFollowing);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={handleClick}
        disabled={isPending}
        aria-pressed={following}
        className={`rounded-full px-5 py-2 text-sm font-heading transition-colors disabled:opacity-60 ${
          following ? "border border-muted/40 text-foreground" : "bg-primary text-foreground"
        }`}
      >
        {following ? t("follow.following") : t("follow.follow")}
      </button>
      {error && <span className="text-xs text-primary">{error}</span>}
    </div>
  );
}
