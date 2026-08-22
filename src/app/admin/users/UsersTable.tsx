"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  cancelUserDeletion,
  promoteToAdmin,
  requestUserDeletion,
  runAccountPurge,
} from "../actions";
import { SortHeader, useTableSort, type SortAccessor } from "../table-sort";
import type { AdminUserRow } from "@/lib/supabase/admin-queries";

const GRACE_MS = 30 * 86_400_000;
// Read once at module load, not during render - React's purity rule, and the
// same pattern the profile and feed pages already use for "now".
const NOW = Date.now();

// Dates sort on the timestamp; "Deletion" sorts on when the purge is due (never
// requested sorts last, as an empty value).
const USER_COLUMNS: Record<string, SortAccessor<AdminUserRow>> = {
  username: (u) => u.username,
  email: (u) => u.email,
  role: (u) => u.role,
  tickets: (u) => u.ticketCount,
  joined: (u) => new Date(u.createdAt).getTime(),
  lastSignIn: (u) => (u.lastSignInAt ? new Date(u.lastSignInAt).getTime() : null),
  deletion: (u) => (u.deletionRequestedAt ? new Date(u.deletionRequestedAt).getTime() : null),
};

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

  const { sorted, sort, toggle } = useTableSort(users, USER_COLUMNS);

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
            <SortHeader label="Username" sortKey="username" sort={sort} onSort={toggle} />
            <SortHeader label="Email" sortKey="email" sort={sort} onSort={toggle} />
            <SortHeader label="Role" sortKey="role" sort={sort} onSort={toggle} />
            <SortHeader label="Tickets" sortKey="tickets" sort={sort} onSort={toggle} />
            <SortHeader label="Joined" sortKey="joined" sort={sort} onSort={toggle} />
            <SortHeader label="Last sign-in" sortKey="lastSignIn" sort={sort} onSort={toggle} />
            <SortHeader label="Deletion" sortKey="deletion" sort={sort} onSort={toggle} />
            <th className="pb-2 font-heading" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((u) => {
            const busy = isPending && pendingId === u.id;
            return (
              <tr key={u.id} className="border-b border-muted/10 last:border-0">
                <td className="py-2">
                  {/* The whole cell is the link, avatar included, so the click
                      target is the row's identity rather than a word in it. */}
                  <Link
                    href={`/admin/users/${u.id}`}
                    className="flex items-center gap-2.5 text-foreground hover:text-accent"
                  >
                    {u.artistPhotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- arbitrary Storage URL, and the admin panel is a handful of internal page views
                      <img
                        src={u.artistPhotoUrl}
                        alt=""
                        className="h-7 w-7 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-raised text-xs text-muted">
                        {u.username.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    {u.username}
                  </Link>
                </td>
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
