"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { EventItem, Ticket } from "@/lib/types";

interface TicketQRModalProps {
  ticket: Ticket;
  event: EventItem;
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

export default function TicketQRModal({ ticket, event, onClose }: TicketQRModalProps) {
  const [qrSrc, setQrSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(ticket.id, { margin: 1, width: 320 }).then((url) => {
      if (!cancelled) {
        setQrSrc(url);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ticket.id]);

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-surface p-6 pb-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-muted/30" />

        <div className="text-center">
          <h2 className="font-display text-2xl text-foreground">{event.title}</h2>
          <p className="mt-1 text-sm text-muted">
            {event.venue} · {formatDate(event.date)} · {event.time}
          </p>
          <p className="mt-1 text-sm text-muted">
            {ticket.quantity} {ticket.quantity === 1 ? "ticket" : "tickets"}
          </p>
        </div>

        <div className="mx-auto mt-6 flex w-fit flex-col items-center gap-3 rounded-3xl bg-white p-5">
          {qrSrc ? (
            // eslint-disable-next-line @next/next/no-img-element -- generated data-url QR code
            <img src={qrSrc} alt="Ticket QR code" className="h-56 w-56" />
          ) : (
            <div className="flex h-56 w-56 items-center justify-center text-sm text-black/50">
              Generating code...
            </div>
          )}
          <p className="font-mono text-xs tracking-wide text-black/60">{ticket.id}</p>
        </div>

        <p className="mt-5 text-center text-xs text-muted">
          Show this code at the door. If it can&apos;t be scanned, give the code above to staff.
        </p>
      </div>
    </div>
  );
}
