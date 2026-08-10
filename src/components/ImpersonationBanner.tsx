"use client";

import { useTransition } from "react";
import { stopImpersonation } from "@/app/admin/users/impersonation-actions";

// Shown across the top of the app whenever the session is an admin
// impersonation (the (app) layout renders it when the mg_impersonating cookie
// is present). Kept in English on purpose: only an admin testing the app ever
// sees it, so it stays out of the user-facing i18n catalog.
export default function ImpersonationBanner({ username }: { username: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-between gap-3 bg-primary px-4 py-2 text-sm text-foreground">
      <span className="font-heading">
        Viewing as <span className="font-display">@{username}</span> (admin)
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => stopImpersonation())}
        className="shrink-0 rounded-full bg-background/25 px-3 py-1 font-heading disabled:opacity-60"
      >
        {pending ? "Exiting…" : "Exit"}
      </button>
    </div>
  );
}
