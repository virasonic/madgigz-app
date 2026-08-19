"use client";

import { useState, useTransition } from "react";
import { tagArtistToEvent } from "./actions";

export default function TagButton({
  eventId,
  profileId,
}: {
  eventId: string;
  profileId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await tagArtistToEvent(eventId, profileId);
      if (result.error) setError(result.error);
      else setDone(true);
    });
  }

  if (done) {
    return <span className="text-xs font-heading text-green-300">Tagged ✓</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded-full bg-primary px-4 py-1.5 text-xs font-heading text-foreground disabled:opacity-40"
      >
        {pending ? "Tagging…" : "Tag artist"}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
