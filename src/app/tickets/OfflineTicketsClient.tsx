"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { loadOfflineTickets, type OfflineTicket } from "@/lib/offline-tickets";
import { useT } from "@/lib/i18n/LocaleProvider";
import { dateLocale } from "@/lib/dates";

// Offline-capable ticket wallet (#129). Sits OUTSIDE the authed (app) group so a
// navigation here survives with no network (the service worker serves the cached
// shell), then renders the QR entirely from the localStorage copy written by the
// Saved page while online. No server data, no auth call — nothing here needs a
// connection once the page and its chunks are cached.

function formatDate(iso: string, dl: string) {
  return new Date(iso).toLocaleDateString(dl, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

function formatSyncedAt(iso: string, dl: string) {
  return new Date(iso).toLocaleString(dl, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OfflineTicketsClient() {
  const { t, locale } = useT();
  const dl = dateLocale(locale);

  // localStorage is only readable on the client, so start empty and hydrate in an
  // effect. `loaded` distinguishes "still reading" from "read, and it was empty".
  const [tickets, setTickets] = useState<OfflineTicket[]>([]);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<OfflineTicket | null>(null);
  const [qrSrc, setQrSrc] = useState<string | null>(null);

  useEffect(() => {
    const store = loadOfflineTickets();
    if (store) {
      setTickets(store.tickets);
      setSavedAt(store.savedAt);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!selected) {
      setQrSrc(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(selected.barcode, { margin: 1, width: 320 }).then((url) => {
      if (!cancelled) setQrSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  return (
    // pt-safe-page: this page sits outside the (app) shell, so it doesn't get
    // the shell's notch padding — without this the heading slides under the
    // iPhone camera/notch (fine on Samsung, which has no cutout there).
    <div className="pt-safe-page mx-auto min-h-screen w-full max-w-md bg-background p-4">

      <div className="mb-1 flex items-center gap-2">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M3.375 5.25c-.62 0-1.125.504-1.125 1.125v3.026a3 3 0 0 1 0 5.198v3.026c0 .621.504 1.125 1.125 1.125h17.25c.621 0 1.125-.504 1.125-1.125v-3.026a3 3 0 0 1 0-5.198V6.375c0-.621-.504-1.125-1.125-1.125H3.375Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <h1 className="font-display text-2xl text-foreground">{t("offlineTickets.title")}</h1>
      </div>
      <p className="mb-5 text-xs text-muted">
        {savedAt
          ? t("offlineTickets.syncedAt", { when: formatSyncedAt(savedAt, dl) })
          : t("offlineTickets.subtitle")}
      </p>

      {loaded && tickets.length === 0 ? (
        <div className="rounded-2xl bg-surface p-5 text-center">
          <p className="text-sm text-muted">{t("offlineTickets.empty")}</p>
          <Link
            href="/saved"
            className="mt-4 inline-block rounded-full bg-primary px-5 py-2.5 text-sm font-heading text-foreground"
          >
            {t("offlineTickets.goToTickets")}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {tickets.map((ticket) => (
            <button
              key={ticket.id}
              onClick={() => setSelected(ticket)}
              className="rounded-2xl bg-surface p-3 text-left"
            >
              <div className="flex items-center gap-2">
                <p className="truncate font-heading text-sm text-foreground">{ticket.title}</p>
                {ticket.tierName && (
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-heading uppercase text-foreground"
                    style={{ backgroundColor: ticket.accentColor }}
                  >
                    {ticket.tierName}
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-muted">
                {ticket.venue} · {formatDate(ticket.date, dl)} · {ticket.time}
              </p>
              <p className="mt-1 text-xs text-accent">{t("offlineTickets.tapToShow")}</p>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/60"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl bg-surface p-6 pb-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <h2 className="font-display text-2xl text-foreground">{selected.title}</h2>
              <p className="mt-1 text-sm text-muted">
                {selected.venue} · {formatDate(selected.date, dl)} · {selected.time}
              </p>
              <p className="mt-1 text-sm text-muted">
                {selected.quantity} {selected.quantity === 1 ? t("ticket.one") : t("ticket.many")}
              </p>
              {selected.tierName && (
                <span
                  className="mt-2 inline-block rounded-full px-3 py-1 text-xs font-heading uppercase tracking-wide text-foreground"
                  style={{ backgroundColor: selected.accentColor }}
                >
                  {selected.tierName}
                </span>
              )}
            </div>

            <div className="mx-auto mt-6 flex w-fit flex-col items-center gap-3 rounded-3xl bg-white p-5">
              {qrSrc ? (
                // eslint-disable-next-line @next/next/no-img-element -- generated data-url QR code
                <img src={qrSrc} alt={t("ticket.qrAlt")} className="h-56 w-56" />
              ) : (
                <div className="flex h-56 w-56 items-center justify-center text-sm text-black/50">
                  {t("ticket.generating")}
                </div>
              )}
              <p className="font-mono text-xs tracking-wide text-black/60">{selected.id}</p>
            </div>

            <p className="mt-5 text-center text-xs text-muted">{t("ticket.showAtDoor")}</p>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="mt-5 w-full rounded-full border border-muted/30 py-2.5 text-sm font-heading text-foreground"
            >
              {t("common.close")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
