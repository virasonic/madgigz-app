"use client";

import { useState, useTransition } from "react";
import { startImpersonation } from "./impersonation-actions";

// Testing-only affordance on the admin user page. On success the server action
// redirects into the app as the target, so the promise never resolves here -
// only a real failure lands in the catch.
export default function ActAsButton({ userId, username }: { userId: string; username: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              await startImpersonation(userId);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not act as this user");
            }
          })
        }
        className="w-fit rounded-full bg-primary px-4 py-2 text-sm font-heading text-foreground disabled:opacity-60"
      >
        {pending ? "Entering…" : `Act as @${username}`}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
