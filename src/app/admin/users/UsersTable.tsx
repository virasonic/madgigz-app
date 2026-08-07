"use client";

import { useState, useTransition } from "react";
import { promoteToAdmin } from "../actions";
import type { AdminUserRow } from "@/lib/supabase/admin-queries";

export default function UsersTable({ users }: { users: AdminUserRow[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handlePromote(userId: string) {
    setPendingId(userId);
    startTransition(async () => {
      await promoteToAdmin(userId);
      setPendingId(null);
    });
  }

  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-muted/15 text-muted">
          <th className="pb-2 font-heading">Username</th>
          <th className="pb-2 font-heading">Email</th>
          <th className="pb-2 font-heading">Role</th>
          <th className="pb-2 font-heading">Tickets</th>
          <th className="pb-2 font-heading">Joined</th>
          <th className="pb-2 font-heading">Last sign-in</th>
          <th className="pb-2 font-heading" />
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.id} className="border-b border-muted/10 last:border-0">
            <td className="py-2 text-foreground">{u.username}</td>
            <td className="py-2 text-muted">{u.email}</td>
            <td className="py-2 text-muted capitalize">{u.role}</td>
            <td className="py-2 text-muted">{u.ticketCount}</td>
            <td className="py-2 text-muted">{new Date(u.createdAt).toLocaleDateString()}</td>
            <td className="py-2 text-muted">
              {u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleDateString() : "Never"}
            </td>
            <td className="py-2 text-right">
              {u.role !== "admin" && (
                <button
                  onClick={() => handlePromote(u.id)}
                  disabled={isPending && pendingId === u.id}
                  className="rounded-lg bg-primary/15 px-3 py-1 text-xs font-heading text-primary hover:bg-primary/25 disabled:opacity-50"
                >
                  {isPending && pendingId === u.id ? "Promoting..." : "Make Admin"}
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
