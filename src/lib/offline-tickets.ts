// Offline ticket cache (#129).
//
// A ticket you can't load is a ticket you can't use, and venues have bad signal.
// So while online we write a compact copy of the fan's OWN tickets to
// localStorage; the standalone /tickets page reads it back and renders the QR
// entirely client-side, working with no connection.
//
// Deliberately narrow: only the current user's tickets, only the fields the door
// screen needs, and never anything sensitive (no price paid, no user id beyond
// the owner tag used to invalidate on account switch). The barcode value is the
// same qr_secret/id the online QR already shows, so the scan path is unchanged.

const KEY = "mg.offline.tickets.v1";

export interface OfflineTicket {
  /** Ticket UUID — shown under the QR, same as the live sheet. */
  id: string;
  /** What the QR encodes and the door scanner looks up (qr_secret, or id pre-#037). */
  barcode: string;
  title: string;
  venue: string;
  venueAddress: string | null;
  /** ISO date (YYYY-MM-DD) of the show. */
  date: string;
  time: string;
  quantity: number;
  tierName: string | null;
  accentColor: string;
}

interface OfflineTicketStore {
  userId: string;
  /** ISO timestamp of the last successful online sync. */
  savedAt: string;
  tickets: OfflineTicket[];
}

// localStorage throws in Safari private mode and when storage is full; a cache
// that fails to write must never break the online page, so everything is
// swallowed and treated as "no offline copy available".

export function saveOfflineTickets(userId: string, tickets: OfflineTicket[]): void {
  if (typeof window === "undefined") return;
  try {
    const store: OfflineTicketStore = { userId, savedAt: new Date().toISOString(), tickets };
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // no-op: offline cache is best-effort
  }
}

export function loadOfflineTickets(): OfflineTicketStore | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OfflineTicketStore;
    if (!parsed || !Array.isArray(parsed.tickets)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// Called on sign-out: the next person to use this device must not find the
// previous account's tickets sitting in localStorage.
export function clearOfflineTickets(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // no-op
  }
}
