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
  fireAndForget("record_event_link_click", eventId);
}

// Records an event share (addendum_045). Same fire-and-forget contract as
// recordEventLinkClick - a missing RPC before the migration runs just no-ops.
export function recordEventShare(eventId: string): void {
  fireAndForget("record_event_share", eventId);
}

function fireAndForget(rpc: "record_event_link_click" | "record_event_share", eventId: string): void {
  try {
    const supabase = createClient();
    void supabase.rpc(rpc, { p_event_id: eventId }).then(
      () => {},
      () => {}
    );
  } catch {
    // ignore - tracking must never break the ticket/share flow
  }
}
