// Native offline-ticket mirror (#129, native half).
//
// The web offline cache (offline-tickets.ts) lives in localStorage + the service
// worker on the madgigz.aurasonic.es origin. The native iOS shell loads that
// origin remotely, so when it launches with NO connection it can't reach the
// origin at all - a different sandbox - and the errorPath fallback
// (capacitor-shell/index.html) can't see that localStorage. Capacitor Preferences
// is NATIVE key-value storage, readable by the local fallback page, so we mirror
// the fan's tickets there too.
//
// Crucially we pre-render each QR to a data URL HERE, while online and with the
// `qrcode` library available, and store the image in the mirror. The offline page
// is then a pure display: it needs no QR library and no network. No-op on web -
// every call is guarded on isNativeApp() and both imports are dynamic, so the web
// bundle is unaffected.

import { isNativeApp } from "@/lib/native";
import type { OfflineTicket } from "@/lib/offline-tickets";

// Same key the web cache uses, but a SEPARATE store (native Preferences, not
// localStorage). Bumping the shape means bumping this suffix.
const NATIVE_KEY = "mg.offline.tickets.v1";

interface NativeOfflineTicket extends OfflineTicket {
  /** Pre-rendered QR (PNG data URL) so the offline page needs no QR lib. */
  qrDataUrl: string;
}

interface NativeOfflineStore {
  userId: string;
  /** BCP-47-ish locale ("en"/"es") so the offline page picks its copy. */
  locale: string;
  savedAt: string;
  tickets: NativeOfflineTicket[];
}

// Mirror the fan's own usable tickets into native Preferences, each with a
// pre-rendered QR. Called alongside saveOfflineTickets whenever the online
// Tickets page refreshes, so the native copy tracks transfers/refunds too.
export async function mirrorOfflineTicketsToNative(
  userId: string,
  locale: string,
  tickets: OfflineTicket[]
): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const QRCode = (await import("qrcode")).default;
    const { Preferences } = await import("@capacitor/preferences");
    const withQr: NativeOfflineTicket[] = await Promise.all(
      tickets.map(async (t) => ({
        ...t,
        qrDataUrl: await QRCode.toDataURL(t.barcode, { margin: 1, width: 320 }),
      }))
    );
    const store: NativeOfflineStore = {
      userId,
      locale,
      savedAt: new Date().toISOString(),
      tickets: withQr,
    };
    await Preferences.set({ key: NATIVE_KEY, value: JSON.stringify(store) });
  } catch {
    // Best-effort: a failed mirror must never break the online page.
  }
}

// Wipe the native mirror on sign-out, so the next person on this device can't
// open the previous account's tickets from the offline fallback.
export async function clearNativeOfflineTickets(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.remove({ key: NATIVE_KEY });
  } catch {
    // no-op
  }
}
