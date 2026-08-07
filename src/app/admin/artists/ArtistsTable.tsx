"use client";

import { useState, useTransition } from "react";
import { setArtistStatus } from "../actions";
import type { AdminArtistApplication } from "@/lib/supabase/admin-queries";
import type { ArtistStatus } from "@/lib/types";

const SOCIAL_FIELDS: { key: keyof AdminArtistApplication; label: string }[] = [
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "twitter", label: "Twitter/X" },
  { key: "spotify", label: "Spotify" },
  { key: "youtube", label: "YouTube" },
];

function StatusBadge({ status }: { status: ArtistStatus }) {
  const styles: Record<ArtistStatus, string> = {
    pending: "bg-primary/15 text-primary",
    approved: "bg-accent/15 text-accent",
    rejected: "bg-danger/15 text-danger",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${styles[status]}`}>
      {status}
    </span>
  );
}

export default function ArtistsTable({
  applications,
}: {
  applications: AdminArtistApplication[];
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSetStatus(id: string, email: string, status: ArtistStatus) {
    setPendingId(id);
    startTransition(async () => {
      await setArtistStatus(id, email, status);
      setPendingId(null);
    });
  }

  if (applications.length === 0) {
    return <p className="text-sm text-muted">No artist accounts yet.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {applications.map((app) => (
        <div key={app.id} className="rounded-2xl bg-surface p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-heading text-foreground">{app.artistName ?? app.username}</p>
                <StatusBadge status={app.artistStatus} />
              </div>
              <p className="text-sm text-muted">
                {app.username} · {app.email}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {app.artistStatus !== "approved" && (
                <button
                  onClick={() => handleSetStatus(app.id, app.email, "approved")}
                  disabled={isPending && pendingId === app.id}
                  className="rounded-lg bg-accent/15 px-3 py-1 text-xs font-heading text-accent hover:bg-accent/25 disabled:opacity-50"
                >
                  Approve
                </button>
              )}
              {app.artistStatus !== "rejected" && (
                <button
                  onClick={() => handleSetStatus(app.id, app.email, "rejected")}
                  disabled={isPending && pendingId === app.id}
                  className="rounded-lg bg-danger/15 px-3 py-1 text-xs font-heading text-danger hover:bg-danger/25 disabled:opacity-50"
                >
                  Reject
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm lg:grid-cols-5">
            {SOCIAL_FIELDS.map(({ key, label }) => {
              const value = app[key] as string | null;
              return (
                <div key={key}>
                  <p className="text-xs text-muted">{label}</p>
                  <p className="truncate text-foreground">{value || "-"}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            {app.evidenceUrl ? (
              <a
                href={app.evidenceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary underline"
              >
                View submitted evidence
              </a>
            ) : (
              <p className="text-sm text-muted">No evidence uploaded.</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
