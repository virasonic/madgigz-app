"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import BackButton from "@/components/ui/BackButton";
import Avatar from "@/components/ui/Avatar";
import {
  beginAddAccount,
  finishAddIfPending,
  forgetAccount,
  switchToAccount,
} from "./actions";

export interface SwitchAccount {
  id: string;
  name: string;
  username: string;
  roleLabel: string;
  active: boolean;
  /** In the remembered store (has a saved session), vs the live account only. */
  saved: boolean;
}

// English UI on purpose (admin-only tooling; see page.tsx).
export default function AccountSwitchClient({
  accounts,
  canAdd,
}: {
  accounts: SwitchAccount[];
  canAdd: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const GENERIC = "Something went wrong. Please try again.";

  // When we land here after an "add account" sign-in, stash the account that was
  // just signed into (a server action, so it can write the httpOnly cookie) and
  // refresh to show it. No-op on an ordinary visit. Runs once.
  const finishedRef = useRef(false);
  useEffect(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    finishAddIfPending()
      .then((added) => {
        if (added) router.refresh();
      })
      .catch(() => {
        /* a stray add-flag is harmless; nothing to surface */
      });
  }, [router]);

  function handleSwitch(id: string) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      try {
        const result = await switchToAccount(id);
        // On success the action redirects and this never runs; a returned value
        // means the saved login had lapsed.
        if (result?.error === "expired") {
          setError("That account's saved login expired — add it again.");
        }
      } catch {
        setError(GENERIC);
      }
      setBusyId(null);
    });
  }

  function handleForget(id: string) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      try {
        await forgetAccount(id);
      } catch {
        setError(GENERIC);
      }
      setBusyId(null);
    });
  }

  function handleAdd() {
    setError(null);
    setBusyId("__add__");
    startTransition(async () => {
      try {
        await beginAddAccount(); // redirects to sign-in
      } catch {
        setError(GENERIC);
        setBusyId(null);
      }
    });
  }

  return (
    <div className="p-4">
      <BackButton className="mb-4" />

      <h1 className="font-display text-2xl text-foreground">Accounts</h1>
      <p className="mb-5 text-sm text-muted">
        Signed in on this device. Tap one to switch — no password needed.
      </p>

      {error && (
        <p className="mb-4 rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>
      )}

      <div className="flex flex-col gap-2">
        {accounts.map((account) => (
          <div
            key={account.id}
            className="flex items-center gap-3 rounded-2xl bg-surface p-3"
          >
            <Avatar photoUrl={null} name={account.name} size={44} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-heading text-sm text-foreground">
                {account.name}
                <span className="ml-2 text-xs font-normal text-muted">{account.roleLabel}</span>
              </p>
              {account.username && (
                <p className="truncate text-xs text-muted">@{account.username}</p>
              )}
            </div>

            {account.active ? (
              <span className="shrink-0 rounded-full bg-primary/15 px-3 py-1 text-[11px] font-heading text-primary">
                Current
              </span>
            ) : (
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSwitch(account.id)}
                  disabled={isPending}
                  className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-heading text-foreground hover:bg-primary-dark disabled:opacity-50"
                >
                  {busyId === account.id ? "Switching…" : "Switch"}
                </button>
                <button
                  type="button"
                  onClick={() => handleForget(account.id)}
                  disabled={isPending}
                  aria-label={`Forget ${account.name}`}
                  className="rounded-full bg-background px-3 py-1.5 text-xs font-heading text-muted hover:text-foreground disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {canAdd && (
        <button
          type="button"
          onClick={handleAdd}
          disabled={isPending}
          className="mt-4 w-full rounded-2xl border border-dashed border-muted/30 px-4 py-3.5 text-sm font-heading text-foreground hover:bg-surface disabled:opacity-50"
        >
          {busyId === "__add__" ? "Opening sign-in…" : "+ Add another account"}
        </button>
      )}

      <p className="mt-4 text-xs text-muted/70">
        Accounts are remembered only on this device and cleared when you sign out.
      </p>
    </div>
  );
}
