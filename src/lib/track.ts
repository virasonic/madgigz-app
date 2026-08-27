import { createClient } from "@/lib/supabase/client";

// Records a ticket-link click as an interest signal for the admin event
// dashboard (#clicks) - external-ticket-link opens and in-app checkout starts.
//
// Deliberately fire-and-forget: it never awaits, blocks, or throws into the
// caller, so opening the external ticket link (which must stay in the user's
// tap gesture on mobile) is never held up. A missing RPC before addendum_044 is
// run (42883), or any network error, is swallowed - a lost interest count is
// not worth a broken button.
export function recordEventLinkClick(eventId: string): void {
  try {
    const supabase = createClient();
    void supabase
      .rpc("record_event_link_click", { p_event_id: eventId })
      .then(
        () => {},
        () => {}
      );
  } catch {
    // ignore - tracking must never break the ticket flow
  }
}
