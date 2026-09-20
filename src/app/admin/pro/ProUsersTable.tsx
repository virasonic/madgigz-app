"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { AdminProAccountRow } from "@/lib/supabase/pro-queries";
import { setProAccountActive } from "./actions";

function Pill({ label, tone }: { label: string; tone: "good" | "warn" | "muted" }) {
  const classes =
    tone === "good"
      ? "bg-accent/15 text-accent"
      : tone === "warn"
        ? "bg-primary/15 text-primary"
        : "bg-muted/15 text-muted";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-heading ${classes}`}>{label}</span>;
}

export default function ProUsersTable({ accounts }: { accounts: AdminProAccountRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(account: AdminProAccountRow) {
    setError(null);
    startTransition(async () => {
      const result = await setProAccountActive(account.id, !account.active);
      if (result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  if (accounts.length === 0) {
    return (
      <p className="text-sm text-muted">
        No pro accounts yet. Create one above and they&apos;ll get an email to set their password.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-muted/15 text-muted">
              <th className="pb-2 font-heading">Name</th>
              <th className="pb-2 font-heading">Type</th>
              <th className="pb-2 font-heading">Email</th>
              <th className="pb-2 text-right font-heading">Shows</th>
              <th className="pb-2 text-right font-heading">Payouts</th>
              <th className="pb-2 text-right font-heading">Status</th>
              <th className="pb-2 text-right font-heading" />
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id} className="border-b border-muted/10 last:border-0">
                <td className="py-3 pr-3 text-foreground">
                  {account.displayName}
                  {account.venueName && (
                    <span className="block text-xs text-muted">{account.venueName}</span>
                  )}
                </td>
                <td className="py-3 pr-3 capitalize text-muted">{account.type}</td>
                <td className="py-3 pr-3 text-muted">{account.email}</td>
                <td className="py-3 pr-3 text-right tabular-nums text-foreground">
                  {account.eventCount}
                </td>
                <td className="py-3 pr-3 text-right">
                  {account.payoutsReady ? (
                    <Pill label="Ready" tone="good" />
                  ) : (
                    <Pill label="Not set up" tone="warn" />
                  )}
                </td>
                <td className="py-3 pr-3 text-right">
                  {account.active ? <Pill label="Active" tone="good" /> : <Pill label="Off" tone="muted" />}
                </td>
                <td className="py-3 text-right">
                  <button
                    type="button"
                    onClick={() => toggle(account)}
                    disabled={isPending}
                    className="rounded-full bg-background px-4 py-2 font-heading text-xs text-foreground ring-1 ring-muted/30 disabled:opacity-60"
                  >
                    {account.active ? "Deactivate" : "Reactivate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
