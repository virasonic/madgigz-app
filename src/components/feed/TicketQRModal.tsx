"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { EventItem, Ticket } from "@/lib/types";
import { mapsUrl } from "@/lib/site";
import { openExternal } from "@/lib/native";
import { shareUrl } from "@/lib/share";
import { createWalletPassUrl } from "@/app/(app)/saved/wallet-actions";
import { createTransfer, cancelTransfer } from "@/app/(app)/saved/transfer-actions";
import { useT } from "@/lib/i18n/LocaleProvider";
import { dateLocale } from "@/lib/dates";
import { useDragToDismiss } from "@/components/ui/useDragToDismiss";

interface TicketQRModalProps {
  ticket: Ticket;
  event: EventItem;
  /** Apple Wallet configured on the server (#129) — shows the "Add to Wallet" button. */
  walletEnabled?: boolean;
  /** Claim token if this ticket already has a transfer link out (#145). */
  pendingTransferToken?: string | null;
  /** Keep the parent's pending-transfer map in sync when a link is created/cancelled. */
  onTransferChange?: (ticketId: string, token: string | null) => void;
  onClose: () => void;
}

// Read once at module load (React purity), same pattern as the profile/feed
// "now" reads. Good enough to tell a past show from an upcoming one (#141).
const TODAY = new Date().toISOString().slice(0, 10);

function formatDate(iso: string, dl: string) {
  return new Date(iso).toLocaleDateString(dl, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export default function TicketQRModal({
  ticket,
  event,
  walletEnabled,
  pendingTransferToken,
  onTransferChange,
  onClose,
}: TicketQRModalProps) {
  const { t, locale } = useT();
  const dl = dateLocale(locale);
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [walletPending, setWalletPending] = useState(false);
  const [transferToken, setTransferToken] = useState<string | null>(pendingTransferToken ?? null);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { handleProps, sheetStyle } = useDragToDismiss(onClose);

  // A ticket can be handed on only while it's a live, un-used ticket to a show
  // that hasn't happened — same rule the server enforces (#145).
  const canTransfer = !ticket.refunded && !ticket.checkedInAt && event.date >= TODAY;
  const claimUrl =
    transferToken && typeof window !== "undefined"
      ? `${window.location.origin}/claim/${transferToken}`
      : null;

  async function handleCreateTransfer() {
    setTransferBusy(true);
    setTransferError(null);
    const result = await createTransfer(ticket.id);
    setTransferBusy(false);
    if ("error" in result) {
      setTransferError(result.error);
      return;
    }
    setTransferToken(result.token);
    onTransferChange?.(ticket.id, result.token);
  }

  async function handleShareClaim() {
    if (!claimUrl) return;
    const outcome = await shareUrl(claimUrl, t("ticket.transfer"));
    if (outcome === "copied") {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  async function handleCancelTransfer() {
    setTransferBusy(true);
    setTransferError(null);
    const result = await cancelTransfer(ticket.id);
    setTransferBusy(false);
    if (result.error) {
      setTransferError(result.error);
      return;
    }
    setTransferToken(null);
    onTransferChange?.(ticket.id, null);
  }

  // Mints a signed pass URL via a server action (which runs in-app, where the
  // login exists) then opens it externally. The token authorises the request in
  // the separate browser that SFSafariViewController is, where the app's login
  // cookie doesn't reach (#129).
  async function handleAddToWallet() {
    setWalletPending(true);
    const result = await createWalletPassUrl(ticket.id);
    setWalletPending(false);
    if ("url" in result) openExternal(`${window.location.origin}${result.url}`);
  }

  // The barcode carries qr_secret — the rotatable value the door scanner looks up
  // (#145) — falling back to the public id only in the pre-addendum_037 window
  // where qr_secret doesn't exist yet.
  const barcodeValue = ticket.qrSecret ?? ticket.id;

  useEffect(() => {
    if (ticket.refunded) return;
    let cancelled = false;
    QRCode.toDataURL(barcodeValue, { margin: 1, width: 320 }).then((url) => {
      if (!cancelled) {
        setQrSrc(url);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [barcodeValue, ticket.refunded]);

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

            {/* Opens the signed .pkpass in the system browser, which presents the
                OS Add-to-Wallet sheet (Apple Wallet on iOS, Google Wallet on
                Android — the .pkpass works on both). Shown only when the server has
                the signing cert AND the show hasn't happened yet (#141): a wallet
                pass for a past gig is pointless. */}
            {walletEnabled && event.date >= TODAY && (
              <button
                type="button"
                onClick={handleAddToWallet}
                disabled={walletPending}
                className="mx-auto mt-4 flex items-center justify-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-heading text-white disabled:opacity-60"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M17 1H7a3 3 0 0 0-3 3v16a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V4a3 3 0 0 0-3-3ZM7 3h10a1 1 0 0 1 1 1v9H6V4a1 1 0 0 1 1-1Zm5 17a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6Z" />
                </svg>
                {t("ticket.addToWallet")}
              </button>
            )}

            {/* Transfer / gift this ticket to someone else (#145). Only while it's
                a live, un-used ticket to an upcoming show. */}
            {canTransfer && (
              <div className="mt-6 border-t border-muted/15 pt-5">
                {transferToken ? (
                  <div className="rounded-2xl bg-background/40 p-4 text-center">
                    <p className="font-heading text-sm text-foreground">
                      {t("ticket.transferPendingTitle")}
                    </p>
                    <p className="mt-1 text-xs text-muted">{t("ticket.transferPendingBody")}</p>
                    {claimUrl && (
                      <p className="mt-3 break-all rounded-lg bg-surface px-3 py-2 font-mono text-[11px] text-muted">
                        {claimUrl}
                      </p>
                    )}
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={handleShareClaim}
                        className="flex-1 rounded-full bg-primary py-2 text-sm font-heading text-foreground"
                      >
                        {copied ? t("ticket.transferCopied") : t("ticket.transferShare")}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelTransfer}
                        disabled={transferBusy}
                        className="flex-1 rounded-full border border-danger/40 py-2 text-sm font-heading text-danger disabled:opacity-50"
                      >
                        {transferBusy ? t("ticket.transferWorking") : t("ticket.transferCancel")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleCreateTransfer}
                    disabled={transferBusy}
                    className="flex w-full items-center justify-center gap-2 rounded-full border border-muted/30 py-3 text-sm font-heading text-foreground disabled:opacity-50"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path
                        d="M4 12v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6M16 6l-4-4-4 4M12 2v13"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    {transferBusy ? t("ticket.transferWorking") : t("ticket.transfer")}
                  </button>
                )}
                {transferError && (
                  <p className="mt-2 text-center text-xs text-danger">{transferError}</p>
                )}
              </div>
            )}

            {/* Restates the policy the buyer already saw at checkout (#146), now
                on the ticket itself. No new policy — just makes it visible after
                the purchase, not only before it. */}
            <p className="mt-5 text-center text-[11px] text-muted">
              {t("ticket.refundPolicyNote")}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
