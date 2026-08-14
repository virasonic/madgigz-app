import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EventItem, EventRow, mapEvent } from "@/lib/types";
import ClaimClient, { ClaimState } from "./ClaimClient";

// Public claim page for a transferred ticket (#145). Sits OUTSIDE the authed
// (app) group on purpose: a signed-out recipient must be able to open the link
// (loaded here with the service role), see the show, and be sent to sign in with
// a `next` back to this page — the (app) layout would instead bounce them to "/"
// and lose the token. Reads auth + live transfer status, so it's dynamic.
export const dynamic = "force-dynamic";

const TODAY = () => new Date().toISOString().slice(0, 10);

export default async function ClaimPage({ params }: PageProps<"/claim/[token]">) {
  const { token } = await params;

  const admin = createAdminClient();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Missing table (pre-migration) or unknown token both fall through to
  // `invalid`, which reads as "this link is no longer valid".
  const { data: transfer } = await admin
    .from("ticket_transfers")
    .select("status, from_user_id, ticket_id")
    .eq("token", token)
    .maybeSingle();

  let event: EventItem | null = null;
  let state: ClaimState = "invalid";

  if (transfer && transfer.status === "pending") {
    const { data: ticket } = await admin
      .from("tickets")
      .select("refunded, checked_in_at, events(*)")
      .eq("id", transfer.ticket_id)
      .maybeSingle();

    // to-one embed: array in the types, single object at runtime.
    const rawEv = ticket?.events as unknown;
    const eventRow = (Array.isArray(rawEv) ? rawEv[0] : rawEv) as EventRow | null;
    if (eventRow) event = mapEvent(eventRow);

    // The same eligibility the claim action re-checks: live, un-used, upcoming.
    const stillClaimable =
      Boolean(ticket) &&
      !ticket!.refunded &&
      !ticket!.checked_in_at &&
      Boolean(event) &&
      event!.date >= TODAY();

    if (!stillClaimable) {
      state = "invalid";
    } else if (!user) {
      state = "signedOut";
    } else if (user.id === transfer.from_user_id) {
      state = "own";
    } else {
      state = "claimable";
    }
  }

  return <ClaimClient token={token} state={state} event={event} />;
}
