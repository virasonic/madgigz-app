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

  function handleRefund() {
    if (
      !window.confirm(
        `Refund ${description}? The buyer gets their money back, the ticket stops working at the door, and the seats go back on sale. This can't be undone.`
      )
    )
      return;

    setError(null);
    startTransition(async () => {
      const result = await refundTicket(ticketId);
      if (result.error) setError(result.error);
    });
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
      {error && <span className="text-[10px] text-danger">{error}</span>}
    </div>
  );
}
