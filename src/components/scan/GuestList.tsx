"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/LocaleProvider";
import { dateLocale } from "@/lib/dates";
import {
  filterGuests,
  sortGuests,
  type GuestEntry,
  type ScanEventOption,
} from "@/lib/guest-list";
import { countAdmissions } from "@/lib/scan-stats";

// The manual check-in panel, laid over the camera in ScannerView: search the
// guest list by username and check someone in by hand - a dead phone, a QR
// that won't scan, a ticket that never arrived. Same panel for both scanners;
// only where the rows and the check-in come from differs, and ScannerView
// already owns that.
//
// Check-ins are optimistic per row (a map of what this panel stamped), so the
// list never reorders or reloads under the door's thumb; the write itself is
// the same atomic "only if still unscanned" the QR path uses, and a refusal
// (someone else got there first, or the link died) shows on the row.
export default function GuestList({
  guests,
  events,
  onPickEvent,
  onCheckIn,
  onClose,
}: {
  /** The rows, or null while loading. Ignored while `events` is set. */
  guests: GuestEntry[] | null;
  /**
   * When the scanner doesn't yet know which show it's for (the logged-in one
   * before its first scan): the shows to choose from, or null while loading.
   */
  events?: ScanEventOption[] | null;
  onPickEvent?: (eventId: string) => void;
  onCheckIn: (ticketId: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const { t, locale } = useT();
  const dl = dateLocale(locale);
  const [query, setQuery] = useState("");
  const [stamped, setStamped] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, true>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function handleCheckIn(ticketId: string) {
    setBusy(ticketId);
    setFailed((f) => {
      const next = { ...f };
      delete next[ticketId];
      return next;
    });
    const ok = await onCheckIn(ticketId);
    setBusy(null);
    if (ok) setStamped((s) => ({ ...s, [ticketId]: new Date().toISOString() }));
    else setFailed((f) => ({ ...f, [ticketId]: true }));
  }

  const rows = guests
    ? sortGuests(
        guests.map((g) =>
          stamped[g.ticketId] ? { ...g, checkedInAt: stamped[g.ticketId] } : g
        )
      )
    : null;
  const count = rows
    ? countAdmissions(
        rows.map((r) => ({
          quantity: r.quantity,
          checked_in_at: r.checkedInAt,
          refunded: false,
        }))
      )
    : null;
  const visible = rows ? filterGuests(rows, query) : null;

  function timeOf(iso: string): string {
    return new Date(iso).toLocaleTimeString(dl, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="absolute inset-0 flex flex-col gap-3 bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl text-foreground">
          {events !== undefined ? t("scan.guestPickShow") : t("scan.guestList")}
        </h2>
        <button type="button" onClick={onClose} className="text-sm text-accent">
          {t("common.close")}
        </button>
      </div>

      {events !== undefined ? (
        // No show yet: pick one. Today's and upcoming shows only (the caller
        // filters), newest-first is wrong at a door, so soonest first.
        <div className="flex flex-col gap-2 overflow-y-auto">
          {events === null ? (
            <p className="text-sm text-muted">{t("scan.guestLoading")}</p>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted">{t("scan.guestNoShows")}</p>
          ) : (
            events.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onPickEvent?.(e.id)}
                className="rounded-2xl bg-surface px-4 py-3 text-left"
              >
                <p className="font-heading text-sm text-foreground">
                  {e.title}
                </p>
                <p className="text-xs text-muted">
                  {e.venue} ·{" "}
                  {new Date(e.date).toLocaleDateString(dl, {
                    day: "numeric",
                    month: "short",
                    timeZone: "UTC",
                  })}
                </p>
              </button>
            ))
          )}
        </div>
      ) : (
        <>
          <input
            type="search"
            autoFocus
            autoComplete="off"
            autoCapitalize="none"
            placeholder={t("scan.guestSearch")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-2xl border border-muted/20 bg-surface px-4 py-3 text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {count && (
            <p className="text-sm text-muted">
              <span className="font-heading text-foreground">
                {count.checkedIn}
              </span>{" "}
              {t("scan.admitted", { total: count.total })}
            </p>
          )}
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
            {visible === null ? (
              <p className="text-sm text-muted">{t("scan.guestLoading")}</p>
            ) : visible.length === 0 ? (
              <p className="text-sm text-muted">
                {query.trim()
                  ? t("scan.guestNoMatch", { query: query.trim() })
                  : t("scan.guestEmpty")}
              </p>
            ) : (
              visible.map((g) => (
                <div
                  key={g.ticketId}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-heading text-sm text-foreground">
                      {g.username}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {[
                        g.seat !== null
                          ? t("scan.guestSeat", { seat: g.seat })
                          : null,
                        g.tierName,
                        g.quantity > 1
                          ? `${g.quantity} ${t("ticket.many")}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {failed[g.ticketId] && (
                      <p className="mt-1 text-xs text-danger">
                        {t("scan.guestFailed")}
                      </p>
                    )}
                  </div>
                  {g.checkedInAt ? (
                    <span className="shrink-0 text-xs text-muted">
                      {t("scan.guestInAt", { time: timeOf(g.checkedInAt) })}
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy === g.ticketId}
                      onClick={() => handleCheckIn(g.ticketId)}
                      className="shrink-0 rounded-full bg-primary px-4 py-2 font-display text-sm tracking-wide text-foreground hover:bg-primary-dark disabled:bg-surface-raised disabled:text-muted"
                    >
                      {t("scan.guestCheckIn")}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
