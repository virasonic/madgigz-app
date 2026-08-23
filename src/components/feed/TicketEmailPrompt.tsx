"use client";

import { useState } from "react";
import { emailTicket } from "@/app/(app)/saved/ticket-email-actions";
import { useT } from "@/lib/i18n/LocaleProvider";

// The "your ticket is saved + email me a copy" block shown on both purchase
// success screens (#155): the free-ticket path inside TicketModal, and the paid
// path on /checkout/complete. Shared so the two can't drift. `ticketId` is null
// only in the rare case the success page can't resolve the just-bought ticket —
// then the note still shows, just without the email button. `accentColor` tints
// the note icon to the show's colour where the caller has it; otherwise it uses
// the brand primary.
export default function TicketEmailPrompt({
  ticketId,
  accentColor,
}: {
  ticketId: string | null;
  accentColor?: string;
}) {
  const { t, locale } = useT();
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [emailedTo, setEmailedTo] = useState<string | null>(null);

  async function handleEmail() {
    if (!ticketId || status === "sending" || status === "sent") return;
    setStatus("sending");
    const result = await emailTicket(ticketId, locale);
    if ("ok" in result) {
      setEmailedTo(result.email);
      setStatus("sent");
    } else {
      setStatus("error");
    }
  }

  return (
    <div className="flex w-full max-w-xs flex-col gap-3">
      <div className="flex items-center gap-3 rounded-2xl bg-background/60 px-4 py-3 text-left ring-1 ring-muted/10">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
            accentColor ? "" : "bg-primary/15 text-primary"
          }`}
          style={accentColor ? { backgroundColor: `${accentColor}26` } : undefined}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1.5a1.5 1.5 0 0 0 0 5V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1.5a1.5 1.5 0 0 0 0-5V8Z"
              stroke={accentColor ?? "currentColor"}
              strokeWidth="1.7"
              strokeLinejoin="round"
            />
            <path
              d="M14 6v12"
              stroke={accentColor ?? "currentColor"}
              strokeWidth="1.7"
              strokeDasharray="2 2"
            />
          </svg>
        </span>
        <p className="text-xs leading-relaxed text-muted">{t("ticket.savedInApp")}</p>
      </div>

      {ticketId && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleEmail}
            disabled={status === "sending" || status === "sent"}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-muted/30 py-3 text-sm font-heading text-foreground disabled:opacity-60"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="m4 7.5 8 5.5 8-5.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {status === "sending"
              ? t("ticket.emailSending")
              : status === "sent"
                ? t("ticket.emailSent")
                : status === "error"
                  ? t("ticket.emailError")
                  : t("ticket.emailTicket")}
          </button>
          {status === "sent" && emailedTo && (
            <p className="text-center text-xs text-accent">
              {t("ticket.emailSentTo", { email: emailedTo })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
