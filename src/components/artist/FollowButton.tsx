"use client";

import { useState, useTransition } from "react";
import { toggleFollow } from "@/app/(app)/profile/follow-actions";

function formatCount(n: number) {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}k`;
}

export default function FollowButton({
  artistId,
  initialFollowing,
  initialCount,
}: {
  artistId: string;
  initialFollowing: boolean;
  initialCount: number;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [count, setCount] = useState(initialCount);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    // Optimistic: following should feel instant. The count moves with it so the
    // number under the button doesn't contradict the button itself.
    const wasFollowing = following;
    setFollowing(!wasFollowing);
    setCount((c) => Math.max(c + (wasFollowing ? -1 : 1), 0));
    setError(null);

    startTransition(async () => {
      const result = await toggleFollow(artistId, wasFollowing);
      if (result.error) {
        setFollowing(wasFollowing);
        setCount((c) => Math.max(c + (wasFollowing ? 1 : -1), 0));
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
          following
            ? "border border-muted/40 text-foreground"
            : "bg-primary text-foreground"
        }`}
      >
        {following ? "Following" : "Follow"}
      </button>
      <span className="text-xs text-muted">
        {formatCount(count)} {count === 1 ? "follower" : "followers"}
      </span>
      {error && <span className="text-xs text-primary">{error}</span>}
    </div>
  );
}
