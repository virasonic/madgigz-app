// Server-only: builds and signs an Apple Wallet `.pkpass` for a ticket (#129
// wallet half). Needs the Pass Type ID signing cert, so it is gated on env — with
// the certs unset it is a no-op and the "Add to Apple Wallet" button never shows,
// exactly like the Cloudflare Stream token gate. NEVER import from a client module.
import { PKPass } from "passkit-generator";
import { ICON, ICON_2X, ICON_3X, LOGO, LOGO_2X } from "@/lib/apple-wallet-assets";
import { appleWalletConfig } from "@/lib/apple-wallet-config";

const decode = (b64: string) => Buffer.from(b64, "base64");

export interface TicketPassInput {
  ticketId: string;
  eventTitle: string;
  venue: string;
  dateISO: string; // event_date, YYYY-MM-DD
  time: string; // event_time, HH:MM
  quantity: number;
  accentColor?: string | null; // hex, e.g. "#d76616"
}

// hex → "rgb(r, g, b)", the colour form pass.json expects.
function toRgb(hex: string | null | undefined, fallback: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((hex ?? "").trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

// Matches the app's UTC date rendering so the pass reads the same as the ticket
// screen (dates are stored/rendered in UTC on purpose across the app).
function formatDate(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateISO;
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * Returns the signed `.pkpass` bytes, or null when Wallet isn't configured. The
 * QR barcode carries the **ticket UUID** — the exact value the door scanner reads
 * from the in-app QR (`ticket.id`), so a Wallet pass scans identically.
 */
export async function buildTicketPass(input: TicketPassInput): Promise<Buffer | null> {
  const cfg = appleWalletConfig();
  if (!cfg) return null;

  const pass = new PKPass(
    {
      "icon.png": decode(ICON),
      "icon@2x.png": decode(ICON_2X),
      "icon@3x.png": decode(ICON_3X),
      "logo.png": decode(LOGO),
      "logo@2x.png": decode(LOGO_2X),
    },
    {
      wwdr: cfg.wwdr,
      signerCert: cfg.signerCert,
      signerKey: cfg.signerKey,
      signerKeyPassphrase: cfg.signerKeyPassphrase,
    },
    {
      passTypeIdentifier: cfg.passTypeIdentifier,
      teamIdentifier: cfg.teamIdentifier,
      organizationName: "MadGigz",
      description: `${input.eventTitle} — MadGigz ticket`,
      serialNumber: input.ticketId,
      backgroundColor: "rgb(10, 8, 7)",
      foregroundColor: "rgb(245, 240, 232)",
      labelColor: toRgb(input.accentColor, "rgb(215, 102, 22)"),
    }
  );

  pass.type = "eventTicket";

  // Surfaces the pass on the lock screen around show time. Floating local
  // datetime — good enough for relevance without wrestling DST offsets.
  const relevant = new Date(`${input.dateISO}T${input.time}:00`);
  if (!Number.isNaN(relevant.getTime())) pass.setRelevantDate(relevant);

  pass.primaryFields.push({ key: "event", label: "EVENT", value: input.eventTitle });
  pass.secondaryFields.push(
    { key: "venue", label: "VENUE", value: input.venue },
    { key: "date", label: "DATE", value: formatDate(input.dateISO) }
  );
  pass.auxiliaryFields.push(
    { key: "time", label: "DOORS", value: input.time },
    {
      key: "tickets",
      label: "TICKETS",
      value: String(input.quantity),
    }
  );
  pass.backFields.push({
    key: "info",
    label: "Entry",
    value: "Show this pass at the door. If it can't be scanned, give the serial number to staff.",
  });

  pass.setBarcodes({
    format: "PKBarcodeFormatQR",
    message: input.ticketId,
    messageEncoding: "iso-8859-1",
  });

  return pass.getAsBuffer();
}
