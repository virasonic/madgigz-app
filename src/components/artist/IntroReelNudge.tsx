"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n/LocaleProvider";
import { useDragToDismiss } from "@/components/ui/useDragToDismiss";
import { getIntroNudgeSeen, markIntroNudgeSeen } from "@/lib/seen-intro-nudge";
import { CURRENT_LEGAL_UPDATE } from "@/lib/legal-updates";
import { getSeenLegalUpdate } from "@/lib/seen-legal-update";

// A one-time pop-up nudging an artist with no intro reel to add one (#143),
// mirroring LegalUpdateNotice's shape - a bottom sheet, drag/tap to dismiss,
// remembered per device. Whether this person is even in the audience (an
// artist, with no intro yet) is decided on the server in the app layout; by the
// time this mounts the only question left is whether they've already dismissed
// it. The CTA sends them to their profile, where the "Add intro reel" card is.
export default function IntroReelNudge({
  // True when this artist is in the legal notice's audience. Whether that notice
  // ACTUALLY shows also depends on a per-device dismissal, checked here - so the
  // nudge only defers when the legal notice will really take the screen, not
  // merely because the person is in its audience.
  legalNoticePending = false,
}: {
  legalNoticePending?: boolean;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  // Default is to nudge again on the next app open (Vir: "show every time").
  // Only an explicit "don't show this again" tick persists the suppression.
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // localStorage can't be read during render (no window on the server), so read
  // after mount - closed on first paint, opening a beat later. Same shape as
  // LegalUpdateNotice.
  useEffect(() => {
    if (getIntroNudgeSeen()) return;
    // Don't stack under the legal notice: if it's pending AND unseen on this
    // device it takes the screen first, so defer to a later launch. Once it's
    // been dismissed (or the person isn't in its audience), this opens.
    const legalWillShow =
      legalNoticePending && getSeenLegalUpdate() !== (CURRENT_LEGAL_UPDATE?.id ?? null);
    if (legalWillShow) return;
    /* eslint-disable react-hooks/set-state-in-effect -- client-only storage read; see LegalUpdateNotice */
    setOpen(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [legalNoticePending]);

  function dismiss() {
    if (dontShowAgain) markIntroNudgeSeen();
    setOpen(false);
  }

  const { handleProps, sheetStyle } = useDragToDismiss(dismiss);
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="intro-nudge-title"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-surface p-6 pb-10"
        style={sheetStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div {...handleProps} className="mx-auto -mt-3 mb-2 flex w-full justify-center pb-3 pt-3">
          <div className="h-1 w-10 rounded-full bg-muted/30" />
        </div>

        <h2 id="intro-nudge-title" className="font-heading text-lg text-foreground">
          {t("introNudge.title")}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-foreground/85">{t("introNudge.body")}</p>

        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          {t("introNudge.dontShowAgain")}
        </label>

        <Link href="/profile" onClick={dismiss} className="mt-5 block">
          <Button className="w-full">{t("introNudge.cta")}</Button>
        </Link>
        <button
          type="button"
          onClick={dismiss}
          className="mt-3 w-full text-center text-sm text-muted underline underline-offset-2"
        >
          {t("introNudge.dismiss")}
        </button>
      </div>
    </div>
  );
}
