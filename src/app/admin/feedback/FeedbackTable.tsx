"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { saveFeedbackNote, setFeedbackStatus } from "./actions";
import type { AdminFeedbackRow } from "@/lib/supabase/admin-queries";

const TYPE_LABEL: Record<string, string> = {
  bug: "Bug",
  support: "Support",
  idea: "Idea",
};

function TypePill({ type }: { type: string }) {
  const tone =
    type === "bug"
      ? "bg-danger/15 text-danger"
      : type === "support"
        ? "bg-primary/15 text-primary"
        : "bg-accent/15 text-accent";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${tone}`}>
      {TYPE_LABEL[type] ?? type}
    </span>
  );
}

function Row({ item }: { item: AdminFeedbackRow }) {
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState(item.adminNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [noteSaved, setNoteSaved] = useState(false);

  function run(fn: () => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="rounded-2xl bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <TypePill type={item.type} />
        {item.status === "resolved" && (
          <span className="rounded-full bg-muted/15 px-2 py-0.5 text-xs text-muted">Resolved</span>
        )}
        {item.status === "new" && (
          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-xs text-accent">New</span>
        )}
        <span className="text-xs text-muted">
          {new Date(item.createdAt).toLocaleString("en-GB", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        {item.route && (
          <span className="rounded-full bg-background px-2 py-0.5 font-mono text-xs text-muted">
            {item.route}
          </span>
        )}
      </div>

      <p className="mt-3 whitespace-pre-wrap text-sm text-foreground">{item.message}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        {item.userId ? (
          <Link href={`/admin/users/${item.userId}`} className="text-accent">
            {item.username ?? "View account"}
          </Link>
        ) : (
          // The account was deleted; addendum_027 nulls user_id rather than
          // taking the message with it.
          <span>Account deleted</span>
        )}
        {item.roleAtSubmission && <span>· {item.roleAtSubmission} at the time</span>}
        {item.contactEmail && (
          <a href={`mailto:${item.contactEmail}`} className="text-accent">
            · {item.contactEmail}
          </a>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {item.status === "resolved" ? (
          <button
            onClick={() => run(() => setFeedbackStatus(item.id, "open"))}
            disabled={isPending}
            className="rounded-lg bg-surface-raised px-3 py-1.5 text-xs font-heading text-foreground hover:bg-muted/20 disabled:opacity-50"
          >
            {isPending ? "..." : "Reopen"}
          </button>
        ) : (
          <>
            {item.status === "new" && (
              <button
                onClick={() => run(() => setFeedbackStatus(item.id, "open"))}
                disabled={isPending}
                className="rounded-lg bg-surface-raised px-3 py-1.5 text-xs font-heading text-foreground hover:bg-muted/20 disabled:opacity-50"
              >
                {isPending ? "..." : "Mark as read"}
              </button>
            )}
            <button
              onClick={() => run(() => setFeedbackStatus(item.id, "resolved"))}
              disabled={isPending}
              className="rounded-lg bg-accent/15 px-3 py-1.5 text-xs font-heading text-accent hover:bg-accent/25 disabled:opacity-50"
            >
              {isPending ? "..." : "Resolve"}
            </button>
          </>
        )}

        <input
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setNoteSaved(false);
          }}
          placeholder="Internal note"
          className="min-w-0 flex-1 rounded-lg border border-muted/20 bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onClick={() =>
            run(async () => {
              const r = await saveFeedbackNote(item.id, note);
              if (!r.error) setNoteSaved(true);
              return r;
            })
          }
          disabled={isPending || note === (item.adminNote ?? "")}
          className="rounded-lg bg-surface-raised px-3 py-1.5 text-xs font-heading text-muted hover:bg-muted/20 disabled:opacity-40"
        >
          {noteSaved ? "Saved" : "Save note"}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}

export default function FeedbackTable({ items }: { items: AdminFeedbackRow[] }) {
  // Same open/closed split as the artist review queue (#72): the thing you came
  // here to do is the default, and the archive is one tap away.
  const [tab, setTab] = useState<"open" | "resolved">("open");

  const open = items.filter((i) => i.status !== "resolved");
  const resolved = items.filter((i) => i.status === "resolved");
  const shown = tab === "open" ? open : resolved;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {(
          [
            ["open", `Open (${open.length})`],
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
          {tab === "open" ? "Nothing waiting. " : "Nothing resolved yet."}
          {tab === "open" && "Everything sent in has been dealt with."}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((item) => (
            <Row key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
