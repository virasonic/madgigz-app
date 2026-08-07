"use client";

import { useState, useTransition } from "react";
import { toggleDiscountActive } from "../actions";
import type { Discount, EventItem } from "@/lib/types";

export default function DiscountsTable({
  discounts,
  events,
}: {
  discounts: Discount[];
  events: EventItem[];
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const eventTitleById = new Map(events.map((e) => [e.id, e.title]));

  function handleToggle(discountId: string, nextActive: boolean) {
    setPendingId(discountId);
    startTransition(async () => {
      await toggleDiscountActive(discountId, nextActive);
      setPendingId(null);
    });
  }

  if (discounts.length === 0) {
    return <p className="text-sm text-muted">No discount codes yet.</p>;
  }

  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-muted/15 text-muted">
          <th className="pb-2 font-heading">Code</th>
          <th className="pb-2 font-heading">Value</th>
          <th className="pb-2 font-heading">Scope</th>
          <th className="pb-2 font-heading">Uses</th>
          <th className="pb-2 font-heading">Expires</th>
          <th className="pb-2 font-heading">Status</th>
          <th className="pb-2 font-heading" />
        </tr>
      </thead>
      <tbody>
        {discounts.map((d) => (
          <tr key={d.id} className="border-b border-muted/10 last:border-0">
            <td className="py-2 font-heading text-foreground">{d.code}</td>
            <td className="py-2 text-muted">{d.type === "percent" ? `${d.value}%` : `€${d.value.toFixed(2)}`}</td>
            <td className="py-2 text-muted">{d.eventId ? eventTitleById.get(d.eventId) ?? "-" : "All events"}</td>
            <td className="py-2 text-muted">
              {d.usedCount}
              {d.maxUses ? ` / ${d.maxUses}` : ""}
            </td>
            <td className="py-2 text-muted">
              {d.expiresAt ? new Date(d.expiresAt).toLocaleDateString() : "Never"}
            </td>
            <td className="py-2">
              <span
                className={
                  d.active
                    ? "rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent"
                    : "rounded-full bg-muted/15 px-2 py-0.5 text-xs text-muted"
                }
              >
                {d.active ? "Active" : "Disabled"}
              </span>
            </td>
            <td className="py-2 text-right">
              <button
                onClick={() => handleToggle(d.id, !d.active)}
                disabled={isPending && pendingId === d.id}
                className="rounded-lg bg-primary/15 px-3 py-1 text-xs font-heading text-primary hover:bg-primary/25 disabled:opacity-50"
              >
                {isPending && pendingId === d.id ? "Saving..." : d.active ? "Disable" : "Enable"}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
