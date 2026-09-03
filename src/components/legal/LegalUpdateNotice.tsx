"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n/LocaleProvider";
import { useDragToDismiss } from "@/components/ui/useDragToDismiss";
import { LEGAL_DOCS, legalUrl, type LegalDocKey } from "@/lib/legal";
import { CURRENT_LEGAL_UPDATE } from "@/lib/legal-updates";
import { getSeenLegalUpdate, markLegalUpdateSeen } from "@/lib/seen-legal-update";

// The in-app half of "we will tell you in the app or by email". Rendered from
// the app shell, so it appears over whichever screen they opened on.
//
// Whether this person is in the audience at all is decided on the server (see
// the layout) - by the time this mounts, the only remaining question is whether
// they have already dismissed this particular update.
export default function LegalUpdateNotice() {
  const { t, locale } = useT();
  const [open, setOpen] = useState(false);
  const update = CURRENT_LEGAL_UPDATE;

  // localStorage cannot be read during render: the server has no window, so a
  // lazy useState initialiser would say "not yet dismissed" on the server and
  // "dismissed" on the client, and this would hydrate open then vanish. Reading
  // after mount is the correct shape - the same trade FeedClient makes for the
  // announcement cards. Closed on first paint and opening a beat later is the
  // right way round for a notice; the reverse flashes it away before it is read.
  useEffect(() => {
    if (!update) return;
    /* eslint-disable react-hooks/set-state-in-effect -- see above */
    if (getSeenLegalUpdate() !== update.id) setOpen(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [update]);

  function dismiss() {
    if (update) markLegalUpdateSeen(update.id);
    setOpen(false);
  }

  const { handleProps, sheetStyle } = useDragToDismiss(dismiss);

  if (!update || !open) return null;

  // Dates render in the reader's language rather than as a raw ISO string -
  // "21 de agosto de 2026" for a Spanish reader. Falls back to the ISO date if
  // the runtime has no data for the locale.
  let effective = update.date;
  try {
    effective = new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(update.date));
  } catch {
    /* keep the ISO date */
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-update-title"
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

        <h2 id="legal-update-title" className="font-heading text-lg text-foreground">
          {t("legalUpdate.title")}
        </h2>
        <p className="mt-1 text-xs text-muted">{t("legalUpdate.effective", { date: effective })}</p>

        <p className="mt-3 text-sm leading-relaxed text-foreground/85">{t("legalUpdate.body")}</p>

        {/* The documents themselves live on the marketing site, and legalUrl
            sends a Spanish reader to the /es copy. Opened in a new tab so
            reading the terms doesn't throw away whatever they were doing. */}
        <ul className="mt-4 flex flex-col gap-2">
          {update.docs.map((doc: LegalDocKey) => (
            <li key={doc}>
              <a
                className="text-sm text-accent underline underline-offset-2"
                href={legalUrl(locale, doc)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t(LEGAL_DOCS[doc].labelKey)}
              </a>
            </li>
          ))}
        </ul>

        <Button className="mt-6 w-full" onClick={dismiss}>
          {t("legalUpdate.acknowledge")}
        </Button>
      </div>
    </div>
  );
}
