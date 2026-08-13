"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { EventItem, Ticket } from "@/lib/types";
import { mapsUrl } from "@/lib/site";
import { openExternal } from "@/lib/native";
import { useT } from "@/lib/i18n/LocaleProvider";
import { dateLocale } from "@/lib/dates";
import { useDragToDismiss } from "@/components/ui/useDragToDismiss";

interface TicketQRModalProps {
  ticket: Ticket;
  event: EventItem;
  /** Apple Wallet configured on the server (#129) — shows the "Add to Wallet" button. */
  walletEnabled?: boolean;
  onClose: () => void;
}

function formatDate(iso: string, dl: string) {
  return new Date(iso).toLocaleDateString(dl, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export default function TicketQRModal({ ticket, event, walletEnabled, onClose }: TicketQRModalProps) {
  const { t, locale } = useT();
  const dl = dateLocale(locale);
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const { handleProps, sheetStyle } = useDragToDismiss(onClose);

  useEffect(() => {
    if (ticket.refunded) return;
    let cancelled = false;
    QRCode.toDataURL(ticket.id, { margin: 1, width: 320 }).then((url) => {
      if (!cancelled) {
        setQrSrc(url);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ticket.id, ticket.refunded]);

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-surface p-6 pb-10"
        style={sheetStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Grab area is padded well beyond the visible pill so the handle is
            easy to catch; drag it down to dismiss (#130). */}
        <div {...handleProps} className="mx-auto -mt-3 mb-2 flex w-full justify-center pb-3 pt-3">
          <div className="h-1 w-10 rounded-full bg-muted/30" />
        </div>

        <div className="text-center">
          <h2 className="font-display text-2xl text-foreground">{event.title}</h2>
          <p className="mt-1 text-sm text-muted">
            {event.venue} · {formatDate(event.date, dl)} · {event.time}
          </p>

          {/* The one screen someone has open while standing outside trying to
              find the door. */}
          <a
            href={mapsUrl(event.venue, event.venueAddress)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm text-accent underline underline-offset-4"
          >
            {event.venueAddress ?? t("ticket.findVenue")} &rarr;
          </a>
          <p className="mt-1 text-sm text-muted">
            {ticket.quantity} {ticket.quantity === 1 ? t("ticket.one") : t("ticket.many")}
          </p>
        </div>

        {ticket.refunded ? (
          <div className="mt-6 rounded-2xl bg-danger/10 p-5 text-center">
            {/* Worded around the ticket, not the event: a ticket can be
                refunded individually while the event goes ahead. */}
            <p className="font-heading text-danger">{t("ticket.refundedTitle")}</p>
            <p className="mt-1 text-sm text-muted">{t("ticket.refundedBody")}</p>
          </div>
        ) : (
          <>
            <div className="mx-auto mt-6 flex w-fit flex-col items-center gap-3 rounded-3xl bg-white p-5">
              {qrSrc ? (
                // eslint-disable-next-line @next/next/no-img-element -- generated data-url QR code
                <img src={qrSrc} alt={t("ticket.qrAlt")} className="h-56 w-56" />
              ) : (
                <div className="flex h-56 w-56 items-center justify-center text-sm text-black/50">
                  {t("ticket.generating")}
                </div>
              )}
              <p className="font-mono text-xs tracking-wide text-black/60">{ticket.id}</p>
            </div>

            <p className="mt-5 text-center text-xs text-muted">{t("ticket.showAtDoor")}</p>

            {/* Opens the signed .pkpass in the system browser (SFSafariViewController
                in the native shell), which presents iOS's Add-to-Wallet sheet — a
                WKWebView can't. Only shown when the server has the signing cert. */}
            {walletEnabled && (
              <button
                type="button"
                onClick={() => openExternal(`${window.location.origin}/api/tickets/${ticket.id}/pass`)}
                className="mx-auto mt-4 flex items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-heading text-white"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M17 1H7a3 3 0 0 0-3 3v16a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V4a3 3 0 0 0-3-3ZM7 3h10a1 1 0 0 1 1 1v9H6V4a1 1 0 0 1 1-1Zm5 17a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6Z" />
                </svg>
                {t("ticket.addToWallet")}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
