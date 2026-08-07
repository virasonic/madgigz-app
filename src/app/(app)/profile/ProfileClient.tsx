"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import ManageShowModal from "@/components/artist/ManageShowModal";
import { createClient } from "@/lib/supabase/client";
import { AppUser, EventItem } from "@/lib/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function SettingsSheet({ onClose }: { onClose: () => void }) {
  const rows = ["Payout Settings", "Promotions", "Analytics"];
  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-surface p-6 pb-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-muted/30" />
        <h2 className="font-display text-xl text-foreground">Settings</h2>
        <div className="mt-4 flex flex-col gap-2">
          {rows.map((row) => (
            <div
              key={row}
              className="flex items-center justify-between rounded-2xl bg-background px-4 py-3.5"
            >
              <span className="text-sm text-foreground">{row}</span>
              <span className="text-xs uppercase text-muted">Soon</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface ProfileClientProps {
  user: AppUser;
  savedCount: number;
  attendedCount: number;
  shows: EventItem[];
}

export default function ProfileClient({
  user,
  savedCount,
  attendedCount,
  shows,
}: ProfileClientProps) {
  const router = useRouter();
  const [activeShow, setActiveShow] = useState<EventItem | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const roleLabel = user.role === "artist" ? "Artist" : "Fan";
  const displayName = user.artistName ?? user.username;
  const ticketsSold = useMemo(() => shows.reduce((sum, show) => sum + show.sold, 0), [shows]);

  async function handleLogOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="p-4">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary font-display text-2xl text-foreground">
            {displayName.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <h1 className="font-display text-2xl text-foreground">{displayName}</h1>
            <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-heading uppercase tracking-wide text-muted">
              {roleLabel}
            </span>
          </div>
        </div>

        {user.role === "artist" && (
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-foreground"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.7 7.7 0 0 0-1.7-1L15 3h-4l-.3 2.5a7.7 7.7 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.7 7.7 0 0 0 1.7 1L11 21h4l.3-2.5a7.7 7.7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6Z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>

      {user.role === "fan" ? (
        <div className="mb-8 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-surface p-4 text-center">
            <p className="font-display text-3xl text-foreground">{attendedCount}</p>
            <p className="text-sm text-muted">Attended</p>
          </div>
          <div className="rounded-2xl bg-surface p-4 text-center">
            <p className="font-display text-3xl text-foreground">{savedCount}</p>
            <p className="text-sm text-muted">Saved</p>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-6 flex gap-3">
            <Link href="/profile/add-show" className="flex-1">
              <Button>Add Show</Button>
            </Link>
            <Link href="/profile/scan" className="flex-1">
              <Button variant="secondary">Scan Tickets</Button>
            </Link>
          </div>

          <div className="mb-8 grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-surface p-4 text-center">
              <p className="font-display text-2xl text-foreground">{shows.length}</p>
              <p className="text-xs text-muted">Shows</p>
            </div>
            <div className="rounded-2xl bg-surface p-4 text-center">
              <p className="font-display text-2xl text-foreground">0</p>
              <p className="text-xs text-muted">Followers</p>
            </div>
            <div className="rounded-2xl bg-surface p-4 text-center">
              <p className="font-display text-2xl text-foreground">{ticketsSold}</p>
              <p className="text-xs text-muted">Tickets Sold</p>
            </div>
          </div>

          <h2 className="mb-3 font-heading text-sm uppercase tracking-wide text-muted">
            Your Shows
          </h2>
          {shows.length === 0 ? (
            <p className="mb-8 text-sm text-muted">
              You haven&apos;t added any shows yet.
            </p>
          ) : (
            <div className="mb-8 flex flex-col gap-3">
              {shows.map((show) => (
                <button
                  key={show.id}
                  onClick={() => setActiveShow(show)}
                  className="flex items-center justify-between rounded-2xl bg-surface p-3.5 text-left"
                >
                  <div className="min-w-0">
                    <p className="truncate font-heading text-sm text-foreground">{show.title}</p>
                    <p className="truncate text-xs text-muted">
                      {formatDate(show.date)} · {show.venue}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted">{show.sold} sold</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <Button variant="ghost" onClick={handleLogOut}>
        Log Out
      </Button>

      {activeShow && (
        <ManageShowModal
          show={activeShow}
          artistName={displayName}
          onClose={() => setActiveShow(null)}
          onChanged={() => router.refresh()}
        />
      )}
      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
