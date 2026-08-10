"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import TicketModal from "@/components/feed/TicketModal";
import TicketQRModal from "@/components/feed/TicketQRModal";
import { createClient } from "@/lib/supabase/client";
import { toggleSavedEvent } from "@/lib/supabase/queries";
import { EventItem, Ticket } from "@/lib/types";
import { hideRefundedTicket } from "./actions";
import { useUrlModal } from "@/lib/useUrlModal";
import { useT } from "@/lib/i18n/LocaleProvider";

type SubTab = "events" | "tickets";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface SavedClientProps {
  userId: string;
  initialEvents: EventItem[];
  initialSavedIds: string[];
  initialTickets: Ticket[];
}

export default function SavedClient({
  userId,
  initialEvents,
  initialSavedIds,
  initialTickets,
}: SavedClientProps) {
  const { t } = useT();
  const [subTab, setSubTab] = useState<SubTab>("tickets");
  // #102: a tapped liked-event opens ?ticket=<id> so back closes the sheet and
  // the link is shareable. The QR modal stays local state - it holds a specific
  // ticket, isn't a browse target, and there's nothing to deep-link to.
  const ticketModal = useUrlModal("ticket");
  const [activeTicket, setActiveTicket] = useState<{ ticket: Ticket; event: EventItem } | null>(
    null
  );
  const [savedIds, setSavedIds] = useState<string[]>(initialSavedIds);
  const [tickets, setTickets] = useState<Ticket[]>(initialTickets);
  const [removingTicketId, setRemovingTicketId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | undefined>();

  const savedEvents = useMemo(
    () => initialEvents.filter((event) => savedIds.includes(event.id)),
    [initialEvents, savedIds]
  );

  const activeEvent = useMemo(
    () => initialEvents.find((event) => event.id === ticketModal.value) ?? null,
    [initialEvents, ticketModal.value]
  );

  const allTicketRows = useMemo(
    () =>
      tickets
        .map((ticket) => ({
          ticket,
          event: initialEvents.find((event) => event.id === ticket.eventId),
        }))
        .filter((row): row is { ticket: Ticket; event: EventItem } => Boolean(row.event)),
    [initialEvents, tickets]
  );

  // Attendance means the ticket was scanned at the door, not that the date has
  // passed - plenty of tickets are bought and never used, and calling those
  // "where you've been" would be a nice lie. checked_in_at is the only record
  // of someone actually turning up.
  const attendedRows = useMemo(
    () =>
      allTicketRows
        .filter((row) => row.ticket.checkedInAt)
        .sort((a, b) => b.event.date.localeCompare(a.event.date)),
    [allTicketRows]
  );

  const ticketRows = useMemo(
    () => allTicketRows.filter((row) => !row.ticket.checkedInAt),
    [allTicketRows]
  );

  // A real toggle rather than unsave-only. From this list it always unsaves -
  // everything here is saved by definition - but the ticket sheet opened from
  // it has a like button too, and that has to be able to put one back.
  async function handleToggleSaved(eventId: string) {
    const wasSaved = savedIds.includes(eventId);
    setSavedIds((ids) => (wasSaved ? ids.filter((id) => id !== eventId) : [...ids, eventId]));
    const supabase = createClient();
    const ok = await toggleSavedEvent(supabase, userId, eventId, wasSaved);
    // Put it back if the write was refused, so the list matches what's actually
    // stored rather than only correcting itself on the next load.
    if (!ok) {
      setSavedIds((ids) => (wasSaved ? [...ids, eventId] : ids.filter((id) => id !== eventId)));
    }
  }

  async function handleRemoveRefunded(ticketId: string) {
    setRemovingTicketId(ticketId);
    setRemoveError(undefined);
    const result = await hideRefundedTicket(ticketId);
    setRemovingTicketId(null);

    if (result.error) {
      setRemoveError(result.error);
      return;
    }
    setTickets((current) => current.filter((t) => t.id !== ticketId));
  }

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center gap-2">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M3.375 5.25c-.62 0-1.125.504-1.125 1.125v3.026a3 3 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a3 3 0 0 1 0-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M16.5 6v.75m0 3v.75m0 3v.75m0 3V18"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        <h1 className="font-display text-2xl text-foreground">{t("savedPage.title")}</h1>
      </div>

      <div className="mb-5 flex gap-2 rounded-full bg-surface p-1">
        <button
          onClick={() => setSubTab("tickets")}
          className={`flex-1 rounded-full py-2 text-sm font-heading ${
            subTab === "tickets" ? "bg-primary text-foreground" : "text-muted"
          }`}
        >
          {t("savedPage.myTickets")} ({ticketRows.length})
        </button>
        <button
          onClick={() => setSubTab("events")}
          className={`flex-1 rounded-full py-2 text-sm font-heading ${
            subTab === "events" ? "bg-primary text-foreground" : "text-muted"
          }`}
        >
          {t("savedPage.likedEvents")}
        </button>
      </div>

      {subTab === "events" ? (
        savedEvents.length === 0 ? (
          <p className="text-sm text-muted">{t("savedPage.emptyEvents")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {savedEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-center gap-3 rounded-2xl bg-surface p-3"
              >
                <button
                  onClick={() => ticketModal.open(event.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl">
                    <Image src={event.image} alt={event.title} fill className="object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-heading text-sm text-foreground">{event.title}</p>
                    <p className="truncate text-xs text-muted">
                      {event.venue} · {formatDate(event.date)}
                    </p>
                  </div>
                </button>
                <span className="shrink-0 text-xs text-muted">€{event.price}</span>
                <button
                  onClick={() => handleToggleSaved(event.id)}
                  aria-label={t("savedPage.removeLiked")}
                  className="shrink-0 rounded-full p-1.5 text-muted hover:text-foreground"
                >
                  <CloseIcon />
                </button>
              </div>
            ))}
          </div>
        )
      ) : ticketRows.length === 0 && attendedRows.length === 0 ? (
        <p className="text-sm text-muted">{t("savedPage.emptyTickets")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {removeError && <p className="text-sm text-danger">{removeError}</p>}
          {ticketRows.length === 0 && (
            <p className="text-sm text-muted">{t("savedPage.noUpcoming")}</p>
          )}
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
                      style={{ backgroundColor: ticket.refunded ? "var(--danger)" : event.accentColor }}
                    >
                      {ticket.refunded
                        ? t("savedPage.statusRefunded")
                        : ticket.checkedInAt
                          ? t("savedPage.statusCheckedIn")
                          : t("savedPage.statusConfirmed")}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted">
                    {event.venue} · {formatDate(event.date)} · {event.time}
                  </p>
                  <p className="text-xs text-muted">
                    {ticket.quantity} {ticket.quantity === 1 ? t("ticket.one") : t("ticket.many")}
                  </p>
                </div>
              </div>
              {ticket.refunded ? (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => setActiveTicket({ ticket, event })}
                    className="flex-1 rounded-full border border-muted/30 py-2 text-sm font-heading text-foreground"
                  >
                    {t("savedPage.viewTicket")}
                  </button>
                  <button
                    onClick={() => handleRemoveRefunded(ticket.id)}
                    disabled={removingTicketId === ticket.id}
                    className="flex-1 rounded-full border border-danger/40 py-2 text-sm font-heading text-danger disabled:opacity-50"
                  >
                    {removingTicketId === ticket.id ? t("savedPage.removing") : t("savedPage.remove")}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setActiveTicket({ ticket, event })}
                  className="mt-3 w-full rounded-full border border-muted/30 py-2 text-sm font-heading text-foreground"
                >
                  {t("savedPage.viewTicket")}
                </button>
              )}
            </div>
          ))}

          {attendedRows.length > 0 && (
            <div className="mt-4">
              <h2 className="font-heading text-sm uppercase tracking-wide text-muted">
                {t("savedPage.whereYouveBeen")}
              </h2>
              <p className="mt-1 text-xs text-muted">
                {t("savedPage.gigsSummary", {
                  count: attendedRows.length,
                  gigs: attendedRows.length === 1 ? t("savedPage.gigOne") : t("savedPage.gigMany"),
                })}
              </p>

              {/* Capped and scrollable: this list only grows, and someone who
                  goes out a lot shouldn't have to scroll past two years of gigs
                  to reach the bottom of the page. */}
              <div className="mt-3 flex max-h-72 flex-col gap-2 overflow-y-auto">
                {attendedRows.map(({ ticket, event }) => (
                  <button
                    key={ticket.id}
                    onClick={() => setActiveTicket({ ticket, event })}
                    className="flex items-center gap-3 rounded-2xl bg-surface p-2.5 text-left"
                  >
                    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg">
                      <Image src={event.image} alt={event.title} fill className="object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-heading text-sm text-foreground">
                        {event.title}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {event.venue} · {formatDate(event.date)}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted">
                      {event.artist}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeEvent && (
        <TicketModal
          key={activeEvent.id}
          event={activeEvent}
          initialTab="info"
          liked={savedIds.includes(activeEvent.id)}
          onToggleLike={() => handleToggleSaved(activeEvent.id)}
          onClose={ticketModal.close}
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
