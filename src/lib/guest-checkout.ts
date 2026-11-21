// Guest checkout (#234), server-only: the account behind a guest's email, and
// the ticket email a paid guest order sends itself. Uses the service-role
// client and node-side QR rendering - never import from a Client Component.
//
// The shape: a guest is an ordinary account that nobody has signed into yet.
// MadGigz makes it at checkout (email_confirm, random password - the same
// mechanism as a pro invite), the ticket belongs to it, and the ticket email
// carries a recovery link that sets a password; the (app) layout then routes
// the person through complete-profile because onboarding_complete is false.
// So "claiming" is just finishing onboarding, and nothing else in the app
// needs a guest concept.
import QRCode from "qrcode";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTicketEmail } from "@/lib/email";
import { dateLocale } from "@/lib/dates";
import type { Locale } from "@/lib/i18n/config";
import { EventRow, mapEvent } from "@/lib/types";

export type GuestBuyer =
  | { status: "ok"; id: string }
  /** The email belongs to an account someone has finished setting up. */
  | { status: "hasAccount" }
  | { status: "error" };

function alreadyRegistered(
  error: { message?: string; code?: string } | null
): boolean {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return (
    error.code === "email_exists" ||
    message.includes("already registered") ||
    message.includes("already been registered") ||
    message.includes("already exists")
  );
}

/**
 * The account a guest order is written against. Makes one for a new email;
 * reuses an unfinished one (an earlier guest order, or an OAuth signup that
 * never completed - the ticket reaches that inbox either way); refuses an
 * email whose owner has a working account, so they sign in and the ticket
 * lands where they'll look for it.
 */
export async function resolveGuestBuyer(
  admin: SupabaseClient,
  email: string
): Promise<GuestBuyer> {
  // No username in the metadata, on purpose: handle_new_user reads a username
  // as "the email form finished" and marks onboarding complete. Without one
  // the profile gets placeholder_username(email) - the email's local part,
  // recognisable enough on the door's guest list - and onboarding_complete
  // false, which is what routes the person through complete-profile when
  // they claim the account.
  const { data: created, error: createError } =
    await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password: crypto.randomUUID(),
    });

  if (created?.user) {
    // Ops marker only (service-role column, addendum_072). A database without
    // the column just goes without the marker.
    await admin
      .from("profiles")
      .update({ guest_checkout_at: new Date().toISOString() })
      .eq("id", created.user.id);
    return { status: "ok", id: created.user.id };
  }

  if (!alreadyRegistered(createError)) {
    console.error("guest checkout createUser failed:", createError);
    return { status: "error" };
  }

  // auth.users isn't queryable through PostgREST; generateLink is the lookup
  // (the pro invite does the same). The token it mints goes unused.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });
  const userId = link?.user?.id;
  if (linkError || !userId) {
    console.error("guest checkout generateLink failed:", linkError);
    return { status: "error" };
  }
  const { data: profile } = await admin
    .from("profiles")
    .select("onboarding_complete")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.onboarding_complete) return { status: "hasAccount" };
  return { status: "ok", id: userId };
}

/**
 * Emails a paid guest order: every seat's QR, plus the link that turns the
 * account into theirs. Called from fulfilment, once, by whichever of the
 * webhook and the success page fulfilled the session first.
 */
export async function sendGuestOrderEmail(
  admin: SupabaseClient,
  input: { sessionId: string; email: string; locale: Locale; appUrl: string }
): Promise<{ sent: boolean }> {
  const { data: rows } = await admin
    .from("tickets")
    .select("id, event_id, tier_id, qr_secret, seat")
    .eq("stripe_session_id", input.sessionId)
    .order("seat");
  const tickets = (rows ?? []) as {
    id: string;
    event_id: string;
    tier_id: string | null;
    qr_secret: string | null;
  }[];
  if (tickets.length === 0) return { sent: false };

  const { data: eventRow } = await admin
    .from("events")
    .select("*, venues(address)")
    .eq("id", tickets[0].event_id)
    .maybeSingle();
  if (!eventRow) return { sent: false };
  const event = mapEvent(eventRow as EventRow);

  let tierName: string | null = null;
  if (tickets[0].tier_id) {
    const { data: tier } = await admin
      .from("event_tiers")
      .select("name")
      .eq("id", tickets[0].tier_id)
      .maybeSingle();
    tierName = (tier?.name as string | null) ?? null;
  }

  const codes = await Promise.all(
    tickets.map(async (ticket) => ({
      ticketId: ticket.id,
      qrPngBase64: (
        await QRCode.toBuffer(ticket.qr_secret ?? ticket.id, {
          margin: 1,
          width: 320,
        })
      ).toString("base64"),
    }))
  );

  // The claim link: a recovery token for the account, through our own
  // /auth/confirm so a spent link gets human copy. guest=1 makes the password
  // screen say "set" rather than "reset" - nobody is recovering anything.
  let claimUrl: string | null = null;
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: input.email,
  });
  if (!linkError && link?.properties?.hashed_token) {
    claimUrl = `${input.appUrl}/auth/confirm?token_hash=${link.properties.hashed_token}&type=recovery&guest=1`;
  } else {
    console.error("guest order claim link failed:", linkError);
  }

  const dateLabel = new Date(event.date).toLocaleDateString(
    dateLocale(input.locale),
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }
  );

  return sendTicketEmail({
    to: input.email,
    locale: input.locale,
    eventTitle: event.title,
    venue: event.venue,
    dateLabel,
    time: event.time,
    tierName,
    codes,
    appUrl: `${input.appUrl}/saved`,
    claimUrl,
  });
}
