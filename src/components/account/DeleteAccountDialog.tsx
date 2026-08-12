"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import Button from "@/components/ui/Button";
import {
  DeletionState,
  cancelAccountDeletion,
  getDeletionState,
  requestAccountDeletion,
} from "@/app/(app)/profile/account-actions";
import { createClient } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n/LocaleProvider";
import { dateLocale } from "@/lib/dates";
import { useDragToDismiss } from "@/components/ui/useDragToDismiss";

function formatDate(iso: string, dl: string) {
  return new Date(iso).toLocaleDateString(dl, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const { t, locale } = useT();
  const dl = dateLocale(locale);
  const { handleProps, sheetStyle } = useDragToDismiss(onClose);
  const router = useRouter();
  const [state, setState] = useState<DeletionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getDeletionState()
      .then((s) => {
        if (!cancelled) setState(s);
      })
      .catch(() => {
        if (!cancelled) setError(t("deleteAccount.loadError"));
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      const result = await requestAccountDeletion();
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.blockers?.length) {
        // Something changed between opening this and pressing the button.
        setState((s) => (s ? { ...s, blockers: result.blockers! } : s));
        return;
      }
      // Signing out is part of the act: leaving them logged in after asking to
      // be deleted invites them to keep using an account that is on its way out.
      await createClient().auth.signOut();
      router.replace("/");
      router.refresh();
    });
  }

  function handleKeep() {
    setError(null);
    startTransition(async () => {
      const result = await cancelAccountDeletion();
      if (result.error) setError(result.error);
      else onClose();
    });
  }

  const blocked = (state?.blockers.length ?? 0) > 0;
  const pending = Boolean(state?.requestedAt);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-surface p-6 pb-10"
        style={sheetStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div {...handleProps} className="mx-auto -mt-3 mb-2 flex w-full justify-center pb-3 pt-3">
          <div className="h-1 w-10 rounded-full bg-muted/30" />
        </div>
        {error && <p className="mb-4 text-sm text-primary">{error}</p>}

        {!state ? (
          <p className="py-6 text-center text-sm text-muted">{t("deleteAccount.checking")}</p>
        ) : pending ? (
          <>
            <h2 className="font-display text-xl text-foreground">
              {t("deleteAccount.scheduledTitle")}
            </h2>
            <p className="mt-2 text-sm text-muted">
              {t("deleteAccount.scheduledLead")}{" "}
              <span className="text-foreground">{formatDate(state.purgeAt!, dl)}</span>.{" "}
              {t("deleteAccount.scheduledTail")}
            </p>
            <Button className="mt-6" onClick={handleKeep} disabled={isPending}>
              {isPending ? t("deleteAccount.cancelling") : t("deleteAccount.keepAccount")}
            </Button>
          </>
        ) : blocked ? (
          <>
            <h2 className="font-display text-xl text-foreground">{t("deleteAccount.blockedTitle")}</h2>
            <p className="mt-2 text-sm text-muted">{t("deleteAccount.blockedBody")}</p>
            <ul className="mt-4 flex flex-col gap-3">
              {state.blockers.map((b) => (
                <li key={b.reason} className="rounded-xl bg-background px-4 py-3">
                  <p className="font-heading text-sm text-foreground">{b.reason}</p>
                  <p className="mt-1 text-xs text-muted">{b.detail}</p>
                </li>
              ))}
            </ul>
            <Button variant="ghost" className="mt-6" onClick={onClose}>
              {t("common.close")}
            </Button>
          </>
        ) : (
          <>
            <h2 className="font-display text-xl text-foreground">{t("deleteAccount.confirmTitle")}</h2>
            {/* Said plainly rather than buried in a policy. Promising complete
                erasure would be a lie: the sale records have to be kept, and
                Stripe keeps its own copy regardless of what we do. */}
            <div className="mt-3 flex flex-col gap-3 text-sm text-muted">
              <p>{t("deleteAccount.confirmBody1")}</p>
              <p>{t("deleteAccount.confirmBody2")}</p>
            </div>
            <div className="mt-6 flex flex-col gap-3">
              <Button onClick={handleDelete} disabled={isPending}>
                {isPending ? t("deleteAccount.scheduling") : t("deleteAccount.deleteButton")}
              </Button>
              <Button variant="ghost" onClick={onClose} disabled={isPending}>
                {t("deleteAccount.keepAccount")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
