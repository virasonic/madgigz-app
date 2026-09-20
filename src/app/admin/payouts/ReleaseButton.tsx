"use client";

import { useState, useTransition } from "react";
import { releaseArtistPayout } from "../actions";
import { formatEuros } from "@/lib/pricing";

export default function ReleaseButton({
  profileId,
  artistName,
  releasableCents,
  availableCents,
  heldCents,
}: {
  profileId: string;
  artistName: string;
  /** Earned on shows past their hold, minus what has already been sent. */
  releasableCents: number;
  /** What Stripe will actually let out of the account today. */
  availableCents: number;
  /** Earned on shows that haven't happened yet. */
  heldCents: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  // Two different things have to be true to pay someone: the money must be DUE
  // (their show has happened and cleared its hold) and it must be AVAILABLE
  // (Stripe has finished settling the card payment). A disabled button that
  // doesn't say which one is missing reads as broken - the first time this
  // greyed out, the money was simply still pending at Stripe and there was no
  // way to tell that from the button.
  const payableCents = Math.min(releasableCents, availableCents);
  const blockedReason =
    payableCents > 0
      ? null
      : releasableCents <= 0
        ? heldCents > 0
          ? "Nothing due — their balance is for shows still to come"
          : "Nothing due to release"
        : `${formatEuros(releasableCents)} due, still clearing at Stripe`;

  function handleRelease() {
    if (
      !window.confirm(
        `Send ${formatEuros(payableCents)} to ${artistName}'s bank account? This is what they've earned on shows that have already taken place.`
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
        disabled={isPending || payableCents <= 0}
        title={blockedReason ?? undefined}
        className="rounded-lg bg-accent/15 px-3 py-1 text-xs font-heading text-accent hover:bg-accent/25 disabled:opacity-40"
      >
        {isPending
          ? "Sending..."
          : payableCents > 0
            ? `Release ${formatEuros(payableCents)}`
            : "Release payout"}
      </button>
      {blockedReason && !message && (
        <span className="max-w-[16rem] text-right text-[10px] text-muted">{blockedReason}</span>
      )}
      {message && (
        <span className={`text-[10px] ${message.kind === "ok" ? "text-accent" : "text-danger"}`}>
          {message.text}
        </span>
      )}
    </div>
  );
}
