"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/LocaleProvider";
import { markAttended, unmarkAttended } from "@/app/(app)/profile/attendance-actions";

// #116 manual attendance on the public event page: for a PAST show, a signed-in
// fan can say "I was there" so it joins their poster wall - the way a gig bought
// outside the app gets onto the wall. Toggleable; controls the manual mark only.
export default function AttendedToggle({
  eventId,
  initialAttended,
}: {
  eventId: string;
  initialAttended: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  const [attended, setAttended] = useState(initialAttended);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const next = !attended;
    const { ok } = next ? await markAttended(eventId) : await unmarkAttended(eventId);
    setBusy(false);
    if (!ok) return;
    setAttended(next);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={attended}
      className={`mt-4 flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 font-heading text-sm transition-colors disabled:opacity-60 ${
        attended
          ? "bg-surface text-accent"
          : "bg-primary text-foreground"
      }`}
    >
      {attended ? (
        <>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M5 12l5 5L20 7"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {t("eventPage.attendedYes")}
        </>
      ) : (
        t("eventPage.attendedMark")
      )}
    </button>
  );
}
