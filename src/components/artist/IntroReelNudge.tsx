"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n/LocaleProvider";
import { useDragToDismiss } from "@/components/ui/useDragToDismiss";
import { getIntroNudgeSeen, markIntroNudgeSeen } from "@/lib/seen-intro-nudge";

// A one-time pop-up nudging an artist with no intro reel to add one (#143),
// mirroring LegalUpdateNotice's shape - a bottom sheet, drag/tap to dismiss,
// remembered per device. Whether this person is even in the audience (an
// artist, with no intro yet) is decided on the server in the app layout; by the
// time this mounts the only question left is whether they've already dismissed
// it. The CTA sends them to their profile, where the "Add intro reel" card is.
export default function IntroReelNudge() {
  const { t } = useT();
  const [open, setOpen] = useState(false);

  // localStorage can't be read during render (no window on the server), so read
  // after mount - closed on first paint, opening a beat later. Same shape as
  // LegalUpdateNotice.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- client-only storage read; see LegalUpdateNotice */
    if (!getIntroNudgeSeen()) setOpen(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function dismiss() {
    markIntroNudgeSeen();
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

        <Link href="/profile" onClick={dismiss} className="mt-6 block">
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
