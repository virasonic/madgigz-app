"use client";

import { useEffect } from "react";
import SignInForm from "@/components/auth/SignInForm";
import { useT } from "@/lib/i18n/LocaleProvider";

// Desktop sign-in modal (#211a). A guest who clicks a gated rail tab (Tickets,
// Notifications, Profile, Settings) gets this dismissible overlay instead of
// being thrown to the full /signin screen - sign in or back out (✕ / backdrop /
// Esc) and you're where you were. `next` is the tab they tried to reach, so a
// successful sign-in lands them there. Desktop-only: it's rendered from SideNav,
// which is itself hidden below lg, and the overlay carries `hidden lg:flex` too.
export default function SignInModal({
  next,
  onClose,
}: {
  next: string | null;
  onClose: () => void;
}) {
  const { t } = useT();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 hidden items-center justify-center bg-black/60 p-4 lg:flex"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-surface p-6 pt-5"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          className="absolute right-4 top-4 rounded-full p-1 text-muted transition-colors hover:text-foreground"
        >
          <CloseIcon />
        </button>
        <SignInForm next={next} onSignedIn={onClose} />
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="m6 6 12 12M18 6 6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
