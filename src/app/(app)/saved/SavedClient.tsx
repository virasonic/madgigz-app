"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import TicketModal from "@/components/feed/TicketModal";
import TicketQRModal from "@/components/feed/TicketQRModal";
import { EventItem, Ticket } from "@/lib/types";

type SubTab = "events" | "tickets";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

interface SavedClientProps {
  initialEvents: EventItem[];
  initialSavedIds: string[];
  initialTickets: Ticket[];
}

export default function SavedClient({
  initialEvents,
  initialSavedIds,
  initialTickets,
}: SavedClientProps) {
  const [subTab, setSubTab] = useState<SubTab>("events");
  const [activeEvent, setActiveEvent] = useState<EventItem | null>(null);
  const [activeTicket, setActiveTicket] = useState<{ ticket: Ticket; event: EventItem } | null>(
    null
  );

  const savedEvents = useMemo(
    () => initialEvents.filter((event) => initialSavedIds.includes(event.id)),
    [initialEvents, initialSavedIds]
  );

  const ticketRows = useMemo(
    () =>
      initialTickets
        .map((ticket) => ({
          ticket,
          event: initialEvents.find((event) => event.id === ticket.eventId),
        }))
        .filter((row): row is { ticket: Ticket; event: EventItem } => Boolean(row.event)),
    [initialEvents, initialTickets]
  );

  return (
    <div className="p-4">
      <h1 className="font-display mb-4 text-2xl text-foreground">Saved</h1>

      <div className="mb-5 flex gap-2 rounded-full bg-surface p-1">
        <button
          onClick={() => setSubTab("events")}
          className={`flex-1 rounded-full py-2 text-sm font-heading ${
            subTab === "events" ? "bg-primary text-foreground" : "text-muted"
          }`}
        >
          Saved Events
        </button>
        <button
          onClick={() => setSubTab("tickets")}
          className={`flex-1 rounded-full py-2 text-sm font-heading ${
            subTab === "tickets" ? "bg-primary text-foreground" : "text-muted"
          }`}
        >
          My Tickets ({ticketRows.length})
        </button>
      </div>

      {subTab === "events" ? (
        savedEvents.length === 0 ? (
          <p className="text-sm text-muted">
            Tap the bookmark icon on an event to save it here.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {savedEvents.map((event) => (
              <button
                key={event.id}
                onClick={() => setActiveEvent(event)}
                className="flex items-center gap-3 rounded-2xl bg-surface p-3 text-left"
              >
                <div className="relative h-14 w-14 overflow-hidden rounded-xl">
                  <Image src={event.image} alt={event.title} fill className="object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-heading text-sm text-foreground">{event.title}</p>
                  <p className="truncate text-xs text-muted">
                    {event.venue} · {formatDate(event.date)}
                  </p>
                </div>
                <span className="text-xs text-muted">€{event.price}</span>
              </button>
            ))}
          </div>
        )
      ) : ticketRows.length === 0 ? (
        <p className="text-sm text-muted">Tickets you buy will show up here.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {ticketRows.map(({ ticket, event }) => (
            <div key={ticket.id} className="rounded-2xl bg-surface p-3">
              <div className="flex gap-3">
                <div className="relative h-16 w-16 overflow-hidden rounded-xl">
                  <Image src={event.image} alt={event.title} fill className="object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-heading text-sm text-foreground">{event.title}</p>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-heading uppercase text-foreground"
                      style={{ backgroundColor: event.accentColor }}
                    >
                      {ticket.checkedInAt ? "Checked in" : "Confirmed"}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted">
                    {event.venue} · {formatDate(event.date)} · {event.time}
                  </p>
                  <p className="text-xs text-muted">
                    {ticket.quantity} {ticket.quantity === 1 ? "ticket" : "tickets"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveTicket({ ticket, event })}
                className="mt-3 w-full rounded-full border border-muted/30 py-2 text-sm font-heading text-foreground"
              >
                View Ticket
              </button>
            </div>
          ))}
        </div>
      )}

      {activeEvent && (
        <TicketModal
          key={activeEvent.id}
          event={activeEvent}
          initialTab="info"
          onClose={() => setActiveEvent(null)}
        />
      )}

      {activeTicket && (
        <TicketQRModal
          key={activeTicket.ticket.id}
          ticket={activeTicket.ticket}
          event={activeTicket.event}
          onClose={() => setActiveTicket(null)}
        />
      )}
    </div>
  );
}
