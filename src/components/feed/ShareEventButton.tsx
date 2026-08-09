"use client";

import { useState } from "react";
import { shareEvent } from "@/lib/share";
import { EventItem } from "@/lib/types";

function ShareIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <circle cx="18" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="18" cy="19" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="m8.2 10.7 7.6-4.4M8.2 13.3l7.6 4.4" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <path
        d="m5 12.5 4.5 4.5L19 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Every share surface in the app - the feed card, the reel, the ticket sheet -
// so the icon, the copied-feedback and the thing being shared can't drift apart
// between them. They all share the *event*, including the reel: a reel is an
// artist's post about a gig, and the gig is what the recipient wants.
export default function ShareEventButton({
  event,
  showLabel = false,
  className = "",
}: {
  event: EventItem;
  showLabel?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    const outcome = await shareEvent(event);
    // On a phone the OS share sheet is its own confirmation. The tick is for
    // desktop, where the fallback is a silent clipboard write that would
    // otherwise look like the button did nothing.
    if (outcome !== "copied") return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={handleShare}
      aria-label={`Share ${event.title}`}
      className={`flex flex-col items-center gap-1 text-foreground ${className}`}
    >
      {copied ? <CheckIcon /> : <ShareIcon />}
      {showLabel && (
        <span className="text-xs text-muted">{copied ? "Link copied" : "Share"}</span>
      )}
    </button>
  );
}
