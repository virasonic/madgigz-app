"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { reportContent } from "@/app/(app)/feed/report-actions";
import { useT } from "@/lib/i18n/LocaleProvider";
import { useDragToDismiss } from "@/components/ui/useDragToDismiss";

const REASONS = [
  { value: "inappropriate", labelKey: "report.reasonInappropriate" },
  { value: "hate", labelKey: "report.reasonHate" },
  { value: "violence", labelKey: "report.reasonViolence" },
  { value: "spam", labelKey: "report.reasonSpam" },
  { value: "other", labelKey: "report.reasonOther" },
] as const;

// Small flag on a reel. Opens a sheet to pick a reason; on submit the post is
// flagged for the admin queue. Deliberately understated - reporting should be
// available, not shouted about, and it sits in the same rail as Like/Share.
export default function ReportButton({ contentPostId }: { contentPostId: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("inappropriate");
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const { handleProps, sheetStyle } = useDragToDismiss(() => setOpen(false));

  async function submit() {
    setSubmitting(true);
    await reportContent({ contentPostId, reason, detail });
    setSubmitting(false);
    setDone(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("report.aria")}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-black/30 text-foreground backdrop-blur-md"
      >
        <FlagIcon />
      </button>

      {/* Portalled to <body> so it escapes the reel card's stacking context and
          paints above the bottom nav — otherwise the sheet is trapped below the
          nav and its submit button hides behind the tab bar (#report bug). Safe
          for SSR: `open` is always false on the server, so document.body is never
          touched during render. */}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
            onClick={() => setOpen(false)}
          >
          <div
            className="w-full max-w-md rounded-t-3xl bg-surface p-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))]"
            style={sheetStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <div {...handleProps} className="mx-auto -mt-3 mb-2 flex w-full justify-center pb-3 pt-3">
              <div className="h-1 w-10 rounded-full bg-muted/30" />
            </div>

            {done ? (
              <div className="flex flex-col gap-4 text-center">
                <h2 className="font-display text-xl text-foreground">{t("report.doneTitle")}</h2>
                <p className="text-sm text-muted">{t("report.doneBody")}</p>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-full bg-primary px-6 py-3.5 font-display text-foreground"
                >
                  {t("common.done")}
                </button>
              </div>
            ) : (
              <>
                <h2 className="font-display text-xl text-foreground">{t("report.title")}</h2>
                <p className="mt-1 text-sm text-muted">{t("report.prompt")}</p>

                <div className="mt-4 flex flex-col gap-2">
                  {REASONS.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setReason(r.value)}
                      aria-pressed={reason === r.value}
                      className={`rounded-2xl px-4 py-3 text-left text-sm transition-colors ${
                        reason === r.value ? "bg-primary text-foreground" : "bg-background text-muted"
                      }`}
                    >
                      {t(r.labelKey)}
                    </button>
                  ))}
                </div>

                <textarea
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  rows={2}
                  maxLength={1000}
                  placeholder={t("report.detailPlaceholder")}
                  className="mt-4 w-full rounded-2xl border border-muted/20 bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
                />

                <button
                  onClick={submit}
                  disabled={submitting}
                  className="mt-4 w-full rounded-full bg-primary px-6 py-3.5 font-display text-foreground disabled:opacity-50"
                >
                  {submitting ? t("report.sending") : t("report.submit")}
                </button>
              </>
            )}
          </div>
          </div>,
          document.body
        )}
    </>
  );
}

function FlagIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 21V4m0 1s1.5-1 4-1 4 2 6.5 2S20 5 20 5v9s-2 1-4.5 1S11 13 8.5 13 5 14 5 14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
