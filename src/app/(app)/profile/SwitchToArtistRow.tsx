"use client";

import { useState, useTransition } from "react";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n/LocaleProvider";
import { startArtistUpgrade } from "./artist-upgrade-actions";

// Fan-only settings row: opens a short confirm, then moves the account into the
// artist review queue and hands off to the claim form. On success the server
// action redirects, so the promise doesn't resolve here.
export default function SwitchToArtistRow() {
  const { t } = useT();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex items-center justify-between rounded-2xl bg-background px-4 py-3.5 text-left"
      >
        <span className="text-sm text-foreground">{t("settings.switchToArtist")}</span>
        <span className="text-xs text-muted">{t("settings.switchToArtistHint")}</span>
      </button>

      {confirming && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6"
          onClick={() => !pending && setConfirming(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-surface p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-xl text-foreground">
              {t("settings.switchConfirmTitle")}
            </h3>
            <p className="mt-2 text-sm text-muted">{t("settings.switchConfirmBody")}</p>
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
            <div className="mt-6 flex flex-col gap-2">
              <Button
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setError(null);
                    try {
                      await startArtistUpgrade();
                    } catch (e) {
                      setError(e instanceof Error ? e.message : "Could not switch");
                    }
                  })
                }
              >
                {pending ? t("settings.switching") : t("common.continue")}
              </Button>
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => setConfirming(false)}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
