"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import { EventItem } from "@/lib/mock-data";
import { addTicket } from "@/lib/session";

type Tab = "tickets" | "info";

interface TicketModalProps {
  event: EventItem;
  initialTab?: Tab;
  onClose: () => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export default function TicketModal({ event, initialTab = "tickets", onClose }: TicketModalProps) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [quantity, setQuantity] = useState(1);
  const [purchased, setPurchased] = useState(false);

  const soldPercent = Math.round((event.sold / event.capacity) * 100);
  const remaining = Math.max(event.capacity - event.sold, 0);
  const soldOut = remaining <= 0;
  const almostGone = !soldOut && soldPercent >= 90;
  const maxQuantity = Math.max(Math.min(remaining, 6), 1);

  const externalUrl = event.ticketing?.mode === "external" ? event.ticketing.url : undefined;
  let externalHost = "the external site";
  if (externalUrl) {
    try {
      externalHost = new URL(externalUrl).hostname.replace(/^www\./, "");
    } catch {
      // keep the generic fallback label
    }
  }

  function handleBuy() {
    addTicket({
      eventId: event.id,
      quantity,
      purchasedAt: new Date().toISOString(),
    });
    setPurchased(true);
  }

  function handleBuyExternal() {
    if (externalUrl) window.open(externalUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface p-6 pb-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-muted/30" />

        {purchased ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full text-2xl"
              style={{ backgroundColor: event.accentColor }}
            >
              ✓
            </div>
            <h2 className="font-display text-2xl text-foreground">You&apos;re going!</h2>
            <p className="text-sm text-muted">
              {quantity} {quantity === 1 ? "ticket" : "tickets"} for {event.title} at {event.venue}
            </p>
            <Button className="mt-4" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <>
            <h2 className="font-display text-2xl text-foreground">{event.title}</h2>
            <p className="mt-1 text-sm text-muted">
              {event.venue} · {formatDate(event.date)} · {event.time}
            </p>

            <div className="mt-5 flex gap-2 rounded-full bg-background p-1">
              <button
                onClick={() => setTab("tickets")}
                className={`flex-1 rounded-full py-2 text-sm font-heading ${
                  tab === "tickets" ? "bg-primary text-foreground" : "text-muted"
                }`}
              >
                Get Tickets
              </button>
              <button
                onClick={() => setTab("info")}
                className={`flex-1 rounded-full py-2 text-sm font-heading ${
                  tab === "info" ? "bg-primary text-foreground" : "text-muted"
                }`}
              >
                More Info
              </button>
            </div>

            {tab === "tickets" && externalUrl ? (
              <div className="mt-6 flex flex-col gap-6">
                <div className="rounded-2xl border border-muted/20 bg-background p-4 text-sm text-muted">
                  Tickets for this event are sold by the artist through an external
                  service. You&apos;ll be taken to {externalHost} to complete your purchase.
                </div>
                <Button onClick={handleBuyExternal}>Buy tickets on {externalHost}</Button>
              </div>
            ) : tab === "tickets" ? (
              <div className="mt-6 flex flex-col gap-6">
                <div className="flex items-center justify-between">
                  <span className="font-heading text-sm text-muted">Quantity</span>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={soldOut}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-muted/30 text-foreground disabled:opacity-30"
                    >
                      −
                    </button>
                    <span className="w-4 text-center font-display text-lg text-foreground">
                      {soldOut ? 0 : quantity}
                    </span>
                    <button
                      onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                      disabled={soldOut}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-muted/30 text-foreground disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/20">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${soldPercent}%`, backgroundColor: event.accentColor }}
                    />
                  </div>
                  {soldOut ? (
                    <p className="mt-2 text-xs text-danger">Sold out</p>
                  ) : (
                    almostGone && (
                      <p className="mt-2 text-xs text-danger">
                        Almost gone — only {remaining} left
                      </p>
                    )
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-muted/15 pt-4">
                  <span className="font-heading text-muted">Total</span>
                  <span className="font-display text-xl text-foreground">
                    €{soldOut ? 0 : event.price * quantity}
                  </span>
                </div>

                <Button onClick={handleBuy} disabled={soldOut}>
                  {soldOut ? "Sold Out" : "Buy tickets"}
                </Button>
              </div>
            ) : (
              <div className="mt-6 flex flex-col gap-5">
                <p className="text-sm text-foreground/90">{event.description}</p>

                <div>
                  <h3 className="font-heading text-sm text-muted">Lineup</h3>
                  <ol className="mt-2 flex flex-col gap-1.5">
                    {event.lineup.map((act, i) => (
                      <li key={act} className="flex items-baseline gap-2 text-sm text-foreground">
                        <span className="text-muted">{i + 1}.</span>
                        <span className={i === 0 ? "font-heading" : undefined}>{act}</span>
                        {i === 0 && (
                          <span className="text-xs uppercase text-muted">Headliner</span>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-muted/15 pt-4 text-sm">
                  <div>
                    <p className="text-muted">Venue</p>
                    <p className="text-foreground">{event.venue}</p>
                  </div>
                  <div>
                    <p className="text-muted">Doors</p>
                    <p className="text-foreground">{event.doors}</p>
                  </div>
                  <div>
                    <p className="text-muted">Age</p>
                    <p className="text-foreground">{event.ageRestriction}</p>
                  </div>
                  <div>
                    <p className="text-muted">Rating</p>
                    <p className="text-foreground">{event.rating.toFixed(1)} / 5</p>
                  </div>
                </div>

                <Button onClick={() => setTab("tickets")}>Get Tickets</Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
