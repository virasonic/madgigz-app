"use client";

import { useState, useTransition } from "react";
import { releaseArtistPayout } from "../actions";
import { formatEuros } from "@/lib/pricing";

export default function ReleaseButton({
  profileId,
  artistName,
  availableCents,
}: {
  profileId: string;
  artistName: string;
  availableCents: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  function handleRelease() {
    if (
      !window.confirm(
        `Send ${formatEuros(availableCents)} to ${artistName}'s bank account? Only do this once their event has taken place.`
      )
    )
      return;

    setMessage(null);
    startTransition(async () => {
      const result = await releaseArtistPayout(profileId);
      if (result.error) setMessage({ kind: "error", text: result.error });
      else setMessage({ kind: "ok", text: `${formatEuros(result.paidCents)} on its way` });
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleRelease}
        disabled={isPending || availableCents <= 0}
        className="rounded-lg bg-accent/15 px-3 py-1 text-xs font-heading text-accent hover:bg-accent/25 disabled:opacity-40"
      >
        {isPending ? "Sending..." : "Release payout"}
      </button>
      {message && (
        <span className={`text-[10px] ${message.kind === "ok" ? "text-accent" : "text-danger"}`}>
          {message.text}
        </span>
      )}
    </div>
  );
}
