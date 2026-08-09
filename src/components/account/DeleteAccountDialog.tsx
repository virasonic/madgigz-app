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

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
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
        if (!cancelled) setError("Couldn't load your account status.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-muted/30" />
        {error && <p className="mb-4 text-sm text-primary">{error}</p>}

        {!state ? (
          <p className="py-6 text-center text-sm text-muted">Checking your account...</p>
        ) : pending ? (
          <>
            <h2 className="font-display text-xl text-foreground">
              Your account is scheduled for deletion
            </h2>
            <p className="mt-2 text-sm text-muted">
              It will be permanently deleted on{" "}
              <span className="text-foreground">{formatDate(state.purgeAt!)}</span>. Until
              then everything still works, and you can change your mind.
            </p>
            <Button className="mt-6" onClick={handleKeep} disabled={isPending}>
              {isPending ? "Cancelling..." : "Keep my account"}
            </Button>
          </>
        ) : blocked ? (
          <>
            <h2 className="font-display text-xl text-foreground">Not just yet</h2>
            <p className="mt-2 text-sm text-muted">
              Deleting now would leave other people stranded, so we need these sorted
              first:
            </p>
            <ul className="mt-4 flex flex-col gap-3">
              {state.blockers.map((b) => (
                <li key={b.reason} className="rounded-xl bg-background px-4 py-3">
                  <p className="font-heading text-sm text-foreground">{b.reason}</p>
                  <p className="mt-1 text-xs text-muted">{b.detail}</p>
                </li>
              ))}
            </ul>
            <Button variant="ghost" className="mt-6" onClick={onClose}>
              Close
            </Button>
          </>
        ) : (
          <>
            <h2 className="font-display text-xl text-foreground">Delete your account?</h2>
            {/* Said plainly rather than buried in a policy. Promising complete
                erasure would be a lie: the sale records have to be kept, and
                Stripe keeps its own copy regardless of what we do. */}
            <div className="mt-3 flex flex-col gap-3 text-sm text-muted">
              <p>
                Your profile, photo, saved events and any content you posted are deleted
                after 30 days. You can sign in during those 30 days to stop it.
              </p>
              <p>
                Records of tickets you bought or sold are kept, without your name attached
                — we&apos;re legally required to hold them for six years. Payment details
                sit with Stripe and follow their own rules.
              </p>
            </div>
            <div className="mt-6 flex flex-col gap-3">
              <Button onClick={handleDelete} disabled={isPending}>
                {isPending ? "Scheduling..." : "Delete my account"}
              </Button>
              <Button variant="ghost" onClick={onClose} disabled={isPending}>
                Keep my account
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
