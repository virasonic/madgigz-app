"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { cancelEvent, toggleEventActive } from "../actions";
import FilterTabs from "../FilterTabs";
import { SortHeader, useTableSort, type SortAccessor } from "../table-sort";
import type { EventItem } from "@/lib/types";

type EventFilter = "live" | "hidden" | "cancelled" | "all";

// Mirrors the Status column: cancelled wins over active, since a cancelled
// event is left inactive too and would otherwise count as hidden.
function statusOf(event: EventItem): Exclude<EventFilter, "all"> {
  if (event.cancelled) return "cancelled";
  return event.active ? "live" : "hidden";
}

type EventInterest = { saves: number; clicks: number; shares: number };

// Base columns are module scope (stable reference). The interest columns
// (saves/clicks/shares) depend on the `interest` map, so they're merged in a
// memo inside the component. Date sorts on the timestamp, counts on the raw
// number.
const BASE_EVENT_COLUMNS: Record<string, SortAccessor<EventItem>> = {
  title: (e) => e.title,
  artist: (e) => e.artist,
  venue: (e) => e.venue,
  date: (e) => new Date(e.date).getTime(),
  sold: (e) => e.sold,
  status: (e) => statusOf(e),
};

export default function EventsTable({
  events,
  interest,
}: {
  events: EventItem[];
  interest: Record<string, EventInterest>;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  // Defaults to live - what's actually on sale is the usual question.
  const [filter, setFilter] = useState<EventFilter>("live");

  const visible = useMemo(
    () => (filter === "all" ? events : events.filter((e) => statusOf(e) === filter)),
    [events, filter]
  );
  const columns = useMemo<Record<string, SortAccessor<EventItem>>>(
    () => ({
      ...BASE_EVENT_COLUMNS,
      saves: (e) => interest[e.id]?.saves ?? 0,
      clicks: (e) => interest[e.id]?.clicks ?? 0,
      shares: (e) => interest[e.id]?.shares ?? 0,
    }),
    [interest]
  );
  const { sorted, sort, toggle } = useTableSort(visible, columns);

  const counts = useMemo(
    () => ({
      live: events.filter((e) => statusOf(e) === "live").length,
      hidden: events.filter((e) => statusOf(e) === "hidden").length,
      cancelled: events.filter((e) => statusOf(e) === "cancelled").length,
      all: events.length,
    }),
    [events]
  );

  function handleToggle(eventId: string, nextActive: boolean) {
    setPendingId(eventId);
    startTransition(async () => {
      await toggleEventActive(eventId, nextActive);
      setPendingId(null);
    });
  }

  function handleDelete(event: EventItem) {
    const message =
      event.sold > 0
        ? `This event has ${event.sold} ${event.sold === 1 ? "ticket" : "tickets"} sold. Cancelling it will refund every buyer through Stripe and hide the event. This can't be undone. Continue?`
        : "Delete this event permanently? This can't be undone.";
    if (!window.confirm(message)) return;

    setPendingId(event.id);
    setResult(null);
    startTransition(async () => {
      const outcome = await cancelEvent(event.id);
      setPendingId(null);
      if (outcome.deleted) {
        setResult({ kind: "ok", text: "Event deleted." });
      } else if (outcome.failed > 0) {
        setResult({
          kind: "error",
          text: `Refunded ${outcome.refunded}, but ${outcome.failed} failed: ${outcome.errors[0] ?? "unknown error"}. Re-run to retry the rest.`,
        });
      } else {
        // The attended count is called out rather than folded into the total:
        // "3 refunded" when 5 were sold would look like two refunds silently
        // failed, when in fact two people had already been through the door.
        const attendedNote =
          outcome.attended > 0
            ? ` ${outcome.attended} ${outcome.attended === 1 ? "ticket was" : "tickets were"} not refunded - already scanned in at the door.`
            : "";
        setResult({
          kind: "ok",
          text: `Event cancelled and ${outcome.refunded} ${outcome.refunded === 1 ? "ticket" : "tickets"} refunded.${attendedNote}`,
        });
      }
    });
  }

  return (
    <>
      {result && (
        <p
          className={`mb-4 rounded-xl px-4 py-3 text-sm ${
            result.kind === "ok" ? "bg-accent/10 text-accent" : "bg-danger/10 text-danger"
          }`}
        >
          {result.text}
        </p>
      )}
      <FilterTabs
        value={filter}
        onChange={setFilter}
        options={[
          { value: "live", label: "Live", count: counts.live },
          { value: "hidden", label: "Hidden", count: counts.hidden },
          { value: "cancelled", label: "Cancelled", count: counts.cancelled },
          { value: "all", label: "All", count: counts.all },
        ]}
      />

      <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-muted/15 text-muted">
          <SortHeader label="Title" sortKey="title" sort={sort} onSort={toggle} />
          <SortHeader label="Artist" sortKey="artist" sort={sort} onSort={toggle} />
          <SortHeader label="Venue" sortKey="venue" sort={sort} onSort={toggle} />
          <SortHeader label="Date" sortKey="date" sort={sort} onSort={toggle} />
          <SortHeader label="Sold / Capacity" sortKey="sold" sort={sort} onSort={toggle} />
          <SortHeader label="Saves" sortKey="saves" sort={sort} onSort={toggle} />
          <SortHeader label="Clicks" sortKey="clicks" sort={sort} onSort={toggle} />
          <SortHeader label="Shares" sortKey="shares" sort={sort} onSort={toggle} />
          <SortHeader label="Status" sortKey="status" sort={sort} onSort={toggle} />
          <th className="pb-2 font-heading" />
        </tr>
      </thead>
      <tbody>
        {sorted.length === 0 && (
          <tr>
            <td colSpan={10} className="py-4 text-muted">
              No {filter === "all" ? "" : filter + " "}events.
            </td>
          </tr>
        )}
        {sorted.map((e) => (
          <tr key={e.id} className="border-b border-muted/10 last:border-0">
            <td className="py-2 text-foreground">
              <Link href={`/admin/events/${e.id}`} className="hover:text-accent hover:underline">
                {e.title}
              </Link>
            </td>
            <td className="py-2 text-muted">{e.artist}</td>
            <td className="py-2 text-muted">{e.venue}</td>
            <td className="py-2 text-muted">
              {/* Explicit locale, not undefined: the server resolves to en-US
                  and the browser to en-GB, which rendered two different date
                  strings and failed hydration. en-GB matches the rest of app. */}
              {new Date(e.date).toLocaleDateString("en-GB", { timeZone: "UTC" })}
            </td>
            <td className="py-2 text-muted">
              {e.sold} / {e.capacity}
            </td>
            <td className="py-2 text-muted tabular-nums">{interest[e.id]?.saves ?? 0}</td>
            <td className="py-2 tabular-nums text-accent">{interest[e.id]?.clicks ?? 0}</td>
            <td className="py-2 text-muted tabular-nums">{interest[e.id]?.shares ?? 0}</td>
            <td className="py-2">
              <span
                className={
                  e.cancelled
                    ? "rounded-full bg-danger/15 px-2 py-0.5 text-xs text-danger"
                    : e.active
                      ? "rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent"
                      : "rounded-full bg-muted/15 px-2 py-0.5 text-xs text-muted"
                }
              >
                {e.cancelled ? "Cancelled" : e.active ? "Active" : "Hidden"}
              </span>
            </td>
            <td className="py-2 text-right">
              {!e.cancelled && (
                <div className="flex justify-end gap-2">
                  {/* Only MadGigz-created shows. An artist's own show is edited
                      from their profile, where the fee split they published
                      under still applies. */}
                  {!e.artistId && (
                    <Link
                      href={`/admin/events/${e.id}/edit`}
                      className="rounded-lg bg-surface-raised px-3 py-1 text-xs font-heading text-foreground hover:bg-muted/20"
                    >
                      Edit
                    </Link>
                  )}
                  <button
                    onClick={() => handleToggle(e.id, !e.active)}
                    disabled={isPending && pendingId === e.id}
                    className="rounded-lg bg-primary/15 px-3 py-1 text-xs font-heading text-primary hover:bg-primary/25 disabled:opacity-50"
                  >
                    {e.active ? "Hide" : "Unhide"}
                  </button>
                  <button
                    onClick={() => handleDelete(e)}
                    disabled={isPending && pendingId === e.id}
                    className="rounded-lg bg-danger/15 px-3 py-1 text-xs font-heading text-danger hover:bg-danger/25 disabled:opacity-50"
                  >
                    {isPending && pendingId === e.id ? "Working..." : "Delete"}
                  </button>
                </div>
              )}
            </td>
          </tr>
        ))}
        </tbody>
      </table>
    </>
  );
}
