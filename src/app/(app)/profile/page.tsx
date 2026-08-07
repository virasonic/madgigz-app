"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import { events } from "@/lib/mock-data";
import {
  clearMockUser,
  getMockUser,
  getSavedEventIds,
  getTickets,
  MockUser,
} from "@/lib/session";

// Computed once at module load rather than during render, per React's purity rules.
const NOW = Date.now();

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<MockUser | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [attendedCount, setAttendedCount] = useState(0);

  useEffect(() => {
    const mockUser = getMockUser();
    const tickets = getTickets();
    const attended = tickets.filter((ticket) => {
      const event = events.find((e) => e.id === ticket.eventId);
      return event && new Date(event.date).getTime() < NOW;
    }).length;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot read of browser-only storage on mount
    setUser(mockUser);
    setSavedCount(getSavedEventIds().length);
    setAttendedCount(attended);
  }, []);

  const roleLabel = useMemo(() => (user?.role === "artist" ? "Artist" : "Fan"), [user]);

  function handleLogOut() {
    clearMockUser();
    router.replace("/");
  }

  if (!user) return null;

  return (
    <div className="p-4">
      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary font-display text-2xl text-foreground">
          {user.username.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <h1 className="font-display text-2xl text-foreground">{user.username}</h1>
          <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-heading uppercase tracking-wide text-muted">
            {roleLabel}
          </span>
        </div>
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
        <div className="mb-8 rounded-2xl border border-accent-dark bg-surface p-5">
          <p className="font-heading text-foreground">Artist tools coming in Stage 3</p>
          <p className="mt-1 text-sm text-muted">
            Show management, analytics, and posting to your fans&apos; feeds will land here.
          </p>
        </div>
      )}

      <Button variant="ghost" onClick={handleLogOut}>
        Log Out
      </Button>
    </div>
  );
}
