"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import TicketModal from "@/components/feed/TicketModal";
import { shareEvent } from "@/lib/share";
import { absoluteUrl, eventPath } from "@/lib/site";
import { EventItem } from "@/lib/types";
import { useUrlModal } from "@/lib/useUrlModal";
import { useT } from "@/lib/i18n/LocaleProvider";
import { isNativeApp, openExternal } from "@/lib/native";
import { recordEventLinkClick } from "@/lib/track";

export default function PublicEventActions({
  event,
  signedIn,
  soldOut,
}: {
  event: EventItem;
  signedIn: boolean;
  soldOut: boolean;
}) {
  const { t } = useT();
  const router = useRouter();
  // #102: ?buy=1 opens the ticket sheet - the event is already this page, so a
  // boolean is enough. The win here is the back button closing the sheet rather
  // than leaving the shared link.
  const buyModal = useUrlModal("buy");
  const modalOpen = buyModal.isOpen;
  const [shareLabel, setShareLabel] = useState<string | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  async function handleShare() {
    const outcome = await shareEvent(event);

    if (outcome === "copied") {
      setShareLabel(t("publicEvent.linkCopied"));
      setTimeout(() => setShareLabel(null), 2000);
      return;
    }

    // Neither the OS share sheet nor the clipboard was available - browsers
    // refuse clipboard writes without focus, and some refuse them outright.
    // Show the URL instead of a dead end: the person can still select it.
    if (outcome === "failed") setFallbackUrl(absoluteUrl(eventPath(event.id)));
  }

  const externalUrl = event.ticketing?.mode === "external" ? event.ticketing.url : undefined;

  function ticketButton() {
    if (event.cancelled) return null;

    // Externally ticketed shows need no MadGigz account at all - sending someone
    // to sign up first, only to bounce them straight out to Entradium, would be
    // a toll booth on a road we don't own.
    if (externalUrl) {
      // A real anchor on the web (new tab, middle-click, SEO). In the native
      // shell we intercept and open an in-app browser sheet instead of throwing
      // the fan out to Safari - see openExternal.
      return (
        <a
          href={externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block"
          onClick={(e) => {
            recordEventLinkClick(event.id);
            if (isNativeApp()) {
              e.preventDefault();
              void openExternal(externalUrl);
            }
          }}
        >
          <Button>{t("publicEvent.getTickets")}</Button>
        </a>
      );
    }

    if (soldOut) return <Button disabled>{t("publicEvent.soldOut")}</Button>;

    if (!signedIn) {
      // ?next brings them back here after signing in, so the link they were
      // sent is still the thing they end up looking at.
      return (
        <Link href={`/signin?next=${encodeURIComponent(eventPath(event.id))}`} className="block">
          <Button>{t("publicEvent.signInToBuy")}</Button>
        </Link>
      );
    }

    return <Button onClick={() => buyModal.open("1")}>{t("publicEvent.getTickets")}</Button>;
  }

  return (
    <div className="mt-6 flex flex-col gap-3">
      {ticketButton()}

      <Button variant="ghost" onClick={handleShare}>
        {shareLabel ?? t("publicEvent.share")}
      </Button>

      {fallbackUrl && (
        <div className="rounded-xl bg-surface px-4 py-3">
          <p className="text-xs text-muted">{t("publicEvent.copyLink")}</p>
          <input
            readOnly
            value={fallbackUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-1 w-full bg-transparent text-sm text-foreground outline-none"
          />
        </div>
      )}

      {!signedIn && !event.cancelled && (
        <p className="text-center text-xs text-muted">
          {t("publicEvent.newHere")}{" "}
          <Link
            href={`/?next=${encodeURIComponent(eventPath(event.id))}`}
            className="text-accent"
          >
            {t("publicEvent.createAccount")}
          </Link>
        </p>
      )}

      {modalOpen && (
        <TicketModal
          event={event}
          onClose={buyModal.close}
          onPurchased={() => router.refresh()}
        />
      )}
    </div>
  );
}
