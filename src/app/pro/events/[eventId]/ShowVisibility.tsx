"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setProEventActive } from "../event-actions";
import { useT } from "@/lib/i18n/LocaleProvider";

// Hiding is reversible and touches nobody's money, which is why it's a button
// here while cancelling (refunds) is not.
export default function ShowVisibility({
  eventId,
  active,
}: {
  eventId: string;
  active: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    startTransition(async () => {
      const result = await setProEventActive(eventId, !active);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface p-5">
      <div>
        <p className="font-heading text-sm text-foreground">
          {t(active ? "pro.liveInApp" : "pro.hiddenFromApp")}
        </p>
        <p className="mt-1 text-xs text-muted">
          {t(active ? "pro.liveInAppHint" : "pro.hiddenFromAppHint")}
        </p>
        {error && <p className="mt-2 text-xs text-primary">{error}</p>}
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={isPending}
        className="shrink-0 rounded-full bg-background px-5 py-2.5 font-heading text-sm text-foreground ring-1 ring-muted/30 disabled:opacity-60"
      >
        {isPending ? t("common.saving") : t(active ? "pro.hideShow" : "pro.makeLive")}
      </button>
    </div>
  );
}
