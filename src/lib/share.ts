import { EventItem } from "@/lib/types";
import { absoluteUrl, eventPath } from "@/lib/site";
import { recordEventShare } from "@/lib/track";

export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

// Phones and tablets get the native sheet; everything else gets the clipboard.
//
// Not a stylistic choice - it's a correctness one. Desktop share targets treat
// the payload as loose text and staple the fields together, so "Copy" from the
// macOS sheet produced "<url> <artist> at <venue>, <date>" as a single string.
// Pasted into an address bar that is one URL with a broken path, and it 404s.
// The clipboard path writes exactly the URL and nothing else, which is what
// someone on a laptop wanted anyway.
function prefersNativeSheet() {
  if (typeof navigator === "undefined" || !navigator.share) return false;
  return navigator.maxTouchPoints > 0;
}

// One share path for every surface - the feed card, the reel, the ticket sheet
// and the public page all call this, so a link shared from one place is the
// same link shared from another.
//
// Deliberately no per-channel buttons (WhatsApp, email, SMS). On a phone
// navigator.share hands over the OS sheet with every app the person actually
// has installed, which is both more choice and less code than anything we
// could build.
// Share (or copy) an arbitrary URL through the same native-sheet/clipboard path
// as shareEvent. Used by the ticket-transfer claim link (#145), which isn't an
// event URL but wants identical behaviour on phone vs desktop.
export async function shareUrl(url: string, title: string): Promise<ShareOutcome> {
  if (prefersNativeSheet()) {
    try {
      await navigator.share({ title, url });
      return "shared";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return "cancelled";
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}

export async function shareEvent(event: EventItem): Promise<ShareOutcome> {
  const url = absoluteUrl(eventPath(event.id));

  if (prefersNativeSheet()) {
    try {
      // title and url only. Passing `text` as well is what let targets
      // concatenate a description onto the link - and a title is displayed as
      // a label by targets that use it, rather than appended to the URL.
      await navigator.share({ title: `${event.title} - ${event.artist}`, url });
      recordEventShare(event.id); // interest signal (#shares) - only on a real share
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
    recordEventShare(event.id); // link copied counts as a share too
    return "copied";
  } catch {
    // Clipboard access needs a secure context, a visible document, and can be
    // refused outright. Callers surface the URL for manual copying instead.
    return "failed";
  }
}
