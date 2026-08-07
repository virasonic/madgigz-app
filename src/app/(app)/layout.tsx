"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import BottomNav from "@/components/ui/BottomNav";
import { getMockUser, MockUser } from "@/lib/session";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<MockUser | null>(null);

  useEffect(() => {
    // Reads the browser-only mock session once on mount; useSyncExternalStore
    // isn't a good fit here since it's a one-shot gate check, not a value that
    // needs to stay live-synced with localStorage across renders.
    const mockUser = getMockUser();
    if (!mockUser) {
      router.replace("/");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(mockUser);
  }, [router]);

  if (!user) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="mx-auto flex h-screen w-full max-w-md flex-col bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      <BottomNav role={user.role} />
    </div>
  );
}
