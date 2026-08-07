"use client";

import { useState, useTransition } from "react";
import { toggleEventActive } from "../actions";
import type { EventItem } from "@/lib/types";

export default function EventsTable({ events }: { events: EventItem[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleToggle(eventId: string, nextActive: boolean) {
    setPendingId(eventId);
    startTransition(async () => {
      await toggleEventActive(eventId, nextActive);
      setPendingId(null);
    });
  }

  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-muted/15 text-muted">
          <th className="pb-2 font-heading">Title</th>
          <th className="pb-2 font-heading">Artist</th>
          <th className="pb-2 font-heading">Venue</th>
          <th className="pb-2 font-heading">Date</th>
          <th className="pb-2 font-heading">Sold / Capacity</th>
          <th className="pb-2 font-heading">Status</th>
          <th className="pb-2 font-heading" />
        </tr>
      </thead>
      <tbody>
        {events.map((e) => (
          <tr key={e.id} className="border-b border-muted/10 last:border-0">
            <td className="py-2 text-foreground">{e.title}</td>
            <td className="py-2 text-muted">{e.artist}</td>
            <td className="py-2 text-muted">{e.venue}</td>
            <td className="py-2 text-muted">
              {new Date(e.date).toLocaleDateString(undefined, { timeZone: "UTC" })}
            </td>
            <td className="py-2 text-muted">
              {e.sold} / {e.capacity}
            </td>
            <td className="py-2">
              <span
                className={
                  e.active
                    ? "rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent"
                    : "rounded-full bg-muted/15 px-2 py-0.5 text-xs text-muted"
                }
              >
                {e.active ? "Active" : "Hidden"}
              </span>
            </td>
            <td className="py-2 text-right">
              <button
                onClick={() => handleToggle(e.id, !e.active)}
                disabled={isPending && pendingId === e.id}
                className="rounded-lg bg-primary/15 px-3 py-1 text-xs font-heading text-primary hover:bg-primary/25 disabled:opacity-50"
              >
                {isPending && pendingId === e.id
                  ? "Saving..."
                  : e.active
                    ? "Hide"
                    : "Unhide"}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
