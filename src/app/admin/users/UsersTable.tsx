"use client";

import { useState, useTransition } from "react";
import {
  cancelUserDeletion,
  promoteToAdmin,
  requestUserDeletion,
  runAccountPurge,
} from "../actions";
import type { AdminUserRow } from "@/lib/supabase/admin-queries";

const GRACE_MS = 30 * 86_400_000;
// Read once at module load, not during render - React's purity rule, and the
// same pattern the profile and feed pages already use for "now".
const NOW = Date.now();

function purgeDate(requestedAt: string) {
  return new Date(new Date(requestedAt).getTime() + GRACE_MS).toLocaleDateString("en-GB");
}

export default function UsersTable({ users }: { users: AdminUserRow[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const dueNow = users.filter(
    (u) =>
      u.deletionRequestedAt &&
      !u.deletedAt &&
      new Date(u.deletionRequestedAt).getTime() + GRACE_MS <= NOW
  ).length;

  function run(userId: string | null, fn: () => Promise<unknown>) {
    setPendingId(userId);
    setMessage(null);
    startTransition(async () => {
      const result = (await fn()) as { error?: string | null } | undefined;
      if (result?.error) setMessage(result.error);
      setPendingId(null);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted">
          {dueNow > 0
            ? `${dueNow} account${dueNow === 1 ? "" : "s"} past the 30-day grace period.`
            : "No accounts are due to be purged."}
        </p>
        {/* The nightly cron does this on its own. The button exists so the purge
            can be tested without waiting a month, and so deletions still land if
            the cron is ever misconfigured. */}
        <button
          onClick={() =>
            run(null, async () => {
              const r = await runAccountPurge();
              setMessage(`Purged ${r.purged}. Failed ${r.failed.length}.`);
            })
          }
          disabled={isPending}
          className="shrink-0 rounded-lg bg-surface-raised px-3 py-1.5 text-xs font-heading text-foreground hover:bg-muted/20 disabled:opacity-50"
        >
          {isPending && pendingId === null ? "Running..." : "Run purge now"}
        </button>
      </div>

      {message && <p className="text-sm text-primary">{message}</p>}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-muted/15 text-muted">
            <th className="pb-2 font-heading">Username</th>
            <th className="pb-2 font-heading">Email</th>
            <th className="pb-2 font-heading">Role</th>
            <th className="pb-2 font-heading">Tickets</th>
            <th className="pb-2 font-heading">Joined</th>
            <th className="pb-2 font-heading">Last sign-in</th>
            <th className="pb-2 font-heading">Deletion</th>
            <th className="pb-2 font-heading" />
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const busy = isPending && pendingId === u.id;
            return (
              <tr key={u.id} className="border-b border-muted/10 last:border-0">
                <td className="py-2 text-foreground">{u.username}</td>
                <td className="py-2 text-muted">{u.email}</td>
                <td className="py-2 text-muted capitalize">{u.role}</td>
                <td className="py-2 text-muted">{u.ticketCount}</td>
                <td className="py-2 text-muted">
                  {new Date(u.createdAt).toLocaleDateString("en-GB")}
                </td>
                <td className="py-2 text-muted">
                  {u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleDateString("en-GB") : "Never"}
                </td>
                <td className="py-2">
                  {u.deletedAt ? (
                    <span className="rounded-full bg-muted/15 px-2 py-0.5 text-xs text-muted">
                      Deleted
                    </span>
                  ) : u.deletionRequestedAt ? (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                      Due {purgeDate(u.deletionRequestedAt)}
                    </span>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </td>
                <td className="py-2 text-right">
                  <div className="flex justify-end gap-2">
                    {u.role !== "admin" && !u.deletedAt && (
                      <button
                        onClick={() => run(u.id, () => promoteToAdmin(u.id))}
                        disabled={busy}
                        className="rounded-lg bg-primary/15 px-3 py-1 text-xs font-heading text-primary hover:bg-primary/25 disabled:opacity-50"
                      >
                        {busy ? "..." : "Make Admin"}
                      </button>
                    )}
                    {!u.deletedAt &&
                      (u.deletionRequestedAt ? (
                        <button
                          onClick={() => run(u.id, () => cancelUserDeletion(u.id))}
                          disabled={busy}
                          className="rounded-lg bg-surface-raised px-3 py-1 text-xs font-heading text-foreground hover:bg-muted/20 disabled:opacity-50"
                        >
                          {busy ? "..." : "Keep"}
                        </button>
                      ) : (
                        <button
                          onClick={() => run(u.id, () => requestUserDeletion(u.id))}
                          disabled={busy}
                          className="rounded-lg bg-surface-raised px-3 py-1 text-xs font-heading text-muted hover:bg-muted/20 disabled:opacity-50"
                        >
                          {busy ? "..." : "Delete"}
                        </button>
                      ))}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
