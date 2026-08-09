"use client";

import { useState, useTransition } from "react";
import { refundTicket } from "../actions";

export default function RefundButton({
  ticketId,
  description,
}: {
  ticketId: string;
  description: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Set when the first attempt was refused because the ticket was scanned in.
  // The override lives behind this rather than in the first confirm: refunding
  // someone who walked through the door is a decision, and it should take a
  // second, separate action to make it.
  const [checkedIn, setCheckedIn] = useState(false);

  function run(force: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await refundTicket(ticketId, force);
      if (result.blockedByCheckIn) {
        setCheckedIn(true);
        setError(null);
        return;
      }
      if (result.error) setError(result.error);
      else setCheckedIn(false);
    });
  }

  function handleRefund() {
    if (
      !window.confirm(
        `Refund ${description}? The buyer gets their money back, the ticket stops working at the door, and the seats go back on sale. This can't be undone.`
      )
    )
      return;
    run(false);
  }

  function handleForce() {
    if (
      !window.confirm(
        `This ticket was scanned in — the holder attended. Refund anyway? Their seat stays counted as used, so it won't go back on sale.`
      )
    )
      return;
    run(true);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleRefund}
        disabled={isPending}
        className="rounded-lg bg-danger/15 px-3 py-1 text-xs font-heading text-danger hover:bg-danger/25 disabled:opacity-50"
      >
        {isPending ? "Refunding..." : "Refund"}
      </button>

      {checkedIn && (
        <div className="flex flex-col items-end gap-1">
          <span className="text-right text-[10px] text-muted">
            Scanned in at the door — they attended.
          </span>
          <button
            onClick={handleForce}
            disabled={isPending}
            className="rounded-lg border border-danger/40 px-3 py-1 text-[10px] font-heading text-danger disabled:opacity-50"
          >
            Refund anyway
          </button>
        </div>
      )}

      {error && <span className="text-right text-[10px] text-danger">{error}</span>}
    </div>
  );
}
