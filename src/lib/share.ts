import { EventItem } from "@/lib/types";
import { absoluteUrl, eventPath } from "@/lib/site";

export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

function shareText(event: EventItem) {
  const date = new Date(event.date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return `${event.artist} at ${event.venue}, ${date}`;
}

// One share path for every surface - the feed card, the reel, the ticket sheet
// and the public page all call this, so a link shared from one place is the
// same link shared from another.
//
// Deliberately no per-channel buttons (WhatsApp, email, SMS). navigator.share
// hands the OS sheet every app the person actually has installed, which is
// both more choice and less code than anything we could build. Desktop
// browsers mostly lack it, hence the clipboard fallback.
export async function shareEvent(event: EventItem): Promise<ShareOutcome> {
  const url = absoluteUrl(eventPath(event.id));

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title: event.title, text: shareText(event), url });
      return "shared";
    } catch (error) {
      // Dismissing the share sheet rejects with AbortError. That's a decision,
      // not a failure, so don't fall through and silently copy a link they
      // just declined to share.
      if (error instanceof Error && error.name === "AbortError") return "cancelled";
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    // Clipboard access needs a secure context and can be refused outright.
    return "failed";
  }
}
