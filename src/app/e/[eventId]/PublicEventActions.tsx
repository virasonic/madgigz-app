"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import TicketModal from "@/components/feed/TicketModal";
import { shareEvent } from "@/lib/share";
import { absoluteUrl, eventPath } from "@/lib/site";
import { EventItem } from "@/lib/types";

export default function PublicEventActions({
  event,
  signedIn,
  soldOut,
}: {
  event: EventItem;
  signedIn: boolean;
  soldOut: boolean;
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [shareLabel, setShareLabel] = useState<string | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  async function handleShare() {
    const outcome = await shareEvent(event);

    if (outcome === "copied") {
      setShareLabel("Link copied");
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
      return (
        <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="block">
          <Button>Get tickets</Button>
        </a>
      );
    }

    if (soldOut) return <Button disabled>Sold out</Button>;

    if (!signedIn) {
      // ?next brings them back here after signing in, so the link they were
      // sent is still the thing they end up looking at.
      return (
        <Link href={`/signin?next=${encodeURIComponent(eventPath(event.id))}`} className="block">
          <Button>Sign in to get tickets</Button>
        </Link>
      );
    }

    return <Button onClick={() => setModalOpen(true)}>Get tickets</Button>;
  }

  return (
    <div className="mt-6 flex flex-col gap-3">
      {ticketButton()}

      <Button variant="ghost" onClick={handleShare}>
        {shareLabel ?? "Share this gig"}
      </Button>

      {fallbackUrl && (
        <div className="rounded-xl bg-surface px-4 py-3">
          <p className="text-xs text-muted">Copy this link:</p>
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
          New here?{" "}
          <Link
            href={`/?next=${encodeURIComponent(eventPath(event.id))}`}
            className="text-accent"
          >
            Create a MadGigz account
          </Link>
        </p>
      )}

      {modalOpen && (
        <TicketModal
          event={event}
          onClose={() => setModalOpen(false)}
          onPurchased={() => router.refresh()}
        />
      )}
    </div>
  );
}
