"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import Button from "@/components/ui/Button";
import { useT } from "@/lib/i18n/LocaleProvider";

// Guests (logged-out visitors) can browse Feed and Explore, but any action that
// writes something for them - saving a show, following an artist, buying a
// ticket - has nowhere to go without an account. Rather than let those calls
// fail server-side, the browse surfaces call promptSignup() and show this sheet,
// turning the moment they try to engage into the sign-up prompt.
//
// Both links carry ?next=<current path> so signing in or up drops them back on
// the exact screen they were browsing.
export function useGuestGate() {
  const [open, setOpen] = useState(false);
  const promptSignup = useCallback(() => setOpen(true), []);
  const sheet = <GuestSheet open={open} onClose={() => setOpen(false)} />;
  return { promptSignup, sheet };
}

function GuestSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useT();
  const pathname = usePathname();
  if (!open) return null;

  const next = encodeURIComponent(pathname || "/feed");

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-surface p-6 pb-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-muted/30" />
        <h2 className="font-display text-2xl text-foreground">{t("guest.title")}</h2>
        <p className="mt-2 text-sm text-muted">{t("guest.body")}</p>
        <div className="mt-6 flex flex-col gap-3">
          {/* Create account routes through the landing role picker (fan/artist),
              carrying next; sign-in goes straight to the form. Mirrors the
              PublicEventActions gate on the shared-event page. */}
          <Link href={`/?next=${next}`} className="block">
            <Button>{t("guest.createAccount")}</Button>
          </Link>
          <Link href={`/signin?next=${next}`} className="block">
            <Button variant="ghost">{t("guest.signIn")}</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
