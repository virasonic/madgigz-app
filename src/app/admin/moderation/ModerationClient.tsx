"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { setPostHidden, setReportStatus } from "./actions";
import type { AdminReportRow } from "@/lib/supabase/admin-queries";

const REASON_LABEL: Record<string, string> = {
  spam: "Spam",
  inappropriate: "Inappropriate",
  hate: "Hate",
  violence: "Violence",
  other: "Other",
};

// Reports are grouped by the post they're about: five people flagging one reel
// is one decision, not five. The card shows the post, who flagged it and why,
// and the two actions that matter - hide the post, or dismiss the reports.
interface PostGroup {
  postId: string;
  postHidden: boolean;
  postCaption: string;
  postHeadline: string | null;
  postMediaUrl: string | null;
  postMediaType: string;
  postArtistName: string;
  postArtistId: string | null;
  postEventId: string | null;
  reports: AdminReportRow[];
  anyOpen: boolean;
}

function groupByPost(rows: AdminReportRow[]): PostGroup[] {
  const map = new Map<string, PostGroup>();
  for (const r of rows) {
    let g = map.get(r.postId);
    if (!g) {
      g = {
        postId: r.postId,
        postHidden: r.postHidden,
        postCaption: r.postCaption,
        postHeadline: r.postHeadline,
        postMediaUrl: r.postMediaUrl,
        postMediaType: r.postMediaType,
        postArtistName: r.postArtistName,
        postArtistId: r.postArtistId,
        postEventId: r.postEventId,
        reports: [],
        anyOpen: false,
      };
      map.set(r.postId, g);
    }
    g.reports.push(r);
    if (r.status === "open") g.anyOpen = true;
  }
  // Newest report first, and open groups above settled ones.
  return [...map.values()].sort((a, b) => {
    if (a.anyOpen !== b.anyOpen) return a.anyOpen ? -1 : 1;
    return b.reports[0].createdAt.localeCompare(a.reports[0].createdAt);
  });
}

export default function ModerationClient({ reports }: { reports: AdminReportRow[] }) {
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const groups = useMemo(() => groupByPost(reports), [reports]);
  const openGroups = groups.filter((g) => g.anyOpen);
  const resolvedGroups = groups.filter((g) => !g.anyOpen);
  const shown = tab === "open" ? openGroups : resolvedGroups;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {(
          [
            ["open", `Open (${openGroups.length})`],
            ["resolved", `Resolved (${resolvedGroups.length})`],
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
          {tab === "open" ? "Nothing waiting. The feed is clear." : "Nothing resolved yet."}
        </p>
      ) : (
        shown.map((g) => <PostCard key={g.postId} group={g} />)
      )}
    </div>
  );
}

function PostCard({ group }: { group: PostGroup }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
    });
  }

  const openIds = group.reports.filter((r) => r.status === "open").map((r) => r.id);

  return (
    <div className="rounded-2xl bg-surface p-5">
      <div className="flex items-start gap-4">
        {group.postMediaType === "video" && group.postMediaUrl ? (
          <video src={group.postMediaUrl} className="h-28 w-20 shrink-0 rounded-lg object-cover" muted />
        ) : group.postMediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Storage URL in an internal panel
          <img src={group.postMediaUrl} alt="" className="h-28 w-20 shrink-0 rounded-lg object-cover" />
        ) : (
          <div className="flex h-28 w-20 shrink-0 items-center justify-center rounded-lg bg-background text-xs text-muted">
            No media
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-heading text-sm text-foreground">
              {group.postArtistId ? (
                <Link href={`/admin/users/${group.postArtistId}`} className="hover:text-accent">
                  {group.postArtistName}
                </Link>
              ) : (
                group.postArtistName
              )}
            </span>
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
              {group.reports.length} report{group.reports.length === 1 ? "" : "s"}
            </span>
            {group.postHidden && (
              <span className="rounded-full bg-muted/15 px-2 py-0.5 text-xs text-muted">Hidden</span>
            )}
          </div>
          {group.postHeadline && (
            <p className="mt-1 text-sm text-foreground">{group.postHeadline}</p>
          )}
          {group.postCaption && <p className="text-sm text-muted">{group.postCaption}</p>}

          <ul className="mt-2 flex flex-col gap-1">
            {group.reports.map((r) => (
              <li key={r.id} className="text-xs text-muted">
                <span className="text-foreground">{REASON_LABEL[r.reason] ?? r.reason}</span>
                {r.detail ? ` — ${r.detail}` : ""}
                {r.reporterUsername ? ` · @${r.reporterUsername}` : ""}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {group.postHidden ? (
          <button
            onClick={() => run(() => setPostHidden(group.postId, false))}
            disabled={isPending}
            className="rounded-lg bg-surface-raised px-3 py-1.5 text-xs font-heading text-foreground hover:bg-muted/20 disabled:opacity-50"
          >
            {isPending ? "…" : "Restore post"}
          </button>
        ) : (
          <button
            onClick={() =>
              run(async () => {
                const r = await setPostHidden(group.postId, true);
                if (!r.error) {
                  // Hiding a post resolves its open reports - the action was
                  // taken, so the queue shouldn't keep nagging about them.
                  await Promise.all(openIds.map((id) => setReportStatus(id, "actioned")));
                }
                return r;
              })
            }
            disabled={isPending}
            className="rounded-lg bg-danger/15 px-3 py-1.5 text-xs font-heading text-danger hover:bg-danger/25 disabled:opacity-50"
          >
            {isPending ? "…" : "Hide post"}
          </button>
        )}

        {group.anyOpen && (
          <button
            onClick={() => run(() => Promise.all(openIds.map((id) => setReportStatus(id, "dismissed"))).then(() => ({ error: null })))}
            disabled={isPending}
            className="rounded-lg bg-surface-raised px-3 py-1.5 text-xs font-heading text-muted hover:bg-muted/20 disabled:opacity-50"
          >
            {isPending ? "…" : "Dismiss reports"}
          </button>
        )}

        {group.postEventId && (
          <Link
            href={`/e/${group.postEventId}`}
            className="rounded-lg bg-surface-raised px-3 py-1.5 text-xs font-heading text-accent hover:bg-muted/20"
          >
            View show
          </Link>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}
