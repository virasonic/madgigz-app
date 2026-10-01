"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { approveRefundRequest, declineRefundRequest } from "./actions";
import { formatEuros } from "@/lib/pricing";
import type { AdminRefundRow } from "@/lib/supabase/admin-queries";

const dmy = (iso: string) => new Date(iso).toLocaleDateString("en-GB");

export default function RefundsClient({ requests }: { requests: AdminRefundRow[] }) {
  const [tab, setTab] = useState<"pending" | "resolved">("pending");
  const pending = useMemo(() => requests.filter((r) => r.status === "pending"), [requests]);
  const resolved = useMemo(() => requests.filter((r) => r.status !== "pending"), [requests]);
  const shown = tab === "pending" ? pending : resolved;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {(
          [
            ["pending", `Pending (${pending.length})`],
            ["resolved", `Resolved (${resolved.length})`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`rounded-full px-4 py-1.5 text-sm font-heading ${
              tab === value ? "bg-primary text-foreground" : "bg-surface text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted">
          {tab === "pending" ? "No refund requests waiting." : "Nothing resolved yet."}
        </p>
      ) : (
        shown.map((r) => <RefundCard key={r.id} request={r} />)
      )}
    </div>
  );
}

function RefundCard({ request }: { request: AdminRefundRow }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");

  function run(fn: () => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
    });
  }

  const isOpen = request.status === "pending";

  return (
    <div className="rounded-2xl bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-heading text-sm text-foreground">
          {request.eventTitle ?? "Unknown show"}
        </span>
        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
          {formatEuros(request.pricePaidCents)}
        </span>
        {request.quantity > 1 && <span className="text-xs text-muted">×{request.quantity}</span>}
        {request.status === "approved" && (
          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">Refunded</span>
        )}
        {request.status === "declined" && (
          <span className="rounded-full bg-muted/15 px-2 py-0.5 text-xs text-muted">Declined</span>
        )}
        {isOpen && request.ticketRefunded && (
          <span className="rounded-full bg-muted/15 px-2 py-0.5 text-xs text-muted">
            Ticket already refunded
          </span>
        )}
        {isOpen && request.ticketCheckedIn && (
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
            Scanned at door
          </span>
        )}
      </div>

      <p className="mt-1 text-xs text-muted">
        {request.buyerId ? (
          <Link href={`/admin/users/${request.buyerId}`} className="hover:text-accent">
            @{request.buyerUsername ?? "user"}
          </Link>
        ) : (
          `@${request.buyerUsername ?? "user"}`
        )}
        {" · requested "}
        {dmy(request.createdAt)}
        {request.eventDate ? ` · show ${dmy(request.eventDate)}` : ""}
      </p>

      {request.reason && <p className="mt-2 text-sm text-foreground">“{request.reason}”</p>}
      {request.adminNote && <p className="mt-1 text-xs text-muted">Note: {request.adminNote}</p>}

      {isOpen && (
        <>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note (kept for the decline)"
            className="mt-3 w-full rounded-lg bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted/60"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => run(() => approveRefundRequest(request.id))}
              disabled={isPending}
              className="rounded-lg bg-accent/15 px-3 py-1.5 text-xs font-heading text-accent hover:bg-accent/25 disabled:opacity-50"
            >
              {isPending ? "…" : "Approve & refund"}
            </button>
            <button
              onClick={() => run(() => declineRefundRequest(request.id, note))}
              disabled={isPending}
              className="rounded-lg bg-surface-raised px-3 py-1.5 text-xs font-heading text-muted hover:bg-muted/20 disabled:opacity-50"
            >
              {isPending ? "…" : "Decline"}
            </button>
            {request.eventId && (
              <Link
                href={`/e/${request.eventId}`}
                className="rounded-lg bg-surface-raised px-3 py-1.5 text-xs font-heading text-accent hover:bg-muted/20"
              >
                View show
              </Link>
            )}
          </div>
        </>
      )}

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
