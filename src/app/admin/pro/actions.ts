"use server";

import { revalidatePath } from "next/cache";
import { adminClient, requireAdmin } from "@/lib/supabase/admin-queries";
import { logDecision } from "@/lib/decision-ledger";
import { sendProInviteEmail } from "@/lib/email";
import { isProNotReady, type ProAccountType } from "@/lib/pro";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/i18n/config";

export interface CreateProAccountInput {
  /** The business name: "Sala El Sol", "Noches Raras Bookings". */
  displayName: string;
  email: string;
  type: ProAccountType;
  /** Required for a venue account, ignored for a promoter. */
  venueId: string | null;
  /**
   * The language their panel opens in and their invite email is written in
   * (#88). Chosen here because the email goes out before this person has a
   * browser we've ever seen, so there is no cookie to read it from. They can
   * change it themselves in the panel afterwards.
   */
  locale: Locale;
}

export interface CreateProAccountResult {
  error?: string;
  /** Set on success. False when Resend isn't configured or the send failed. */
  emailSent?: boolean;
  /**
   * The set-password link, returned ONLY when the email didn't send. An account
   * whose password nobody knows and whose invite bounced is unreachable, so the
   * admin needs a way to pass the link on by hand rather than discovering the
   * problem through a support request a week later.
   */
  setPasswordUrl?: string;
  existingAccount?: boolean;
}

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

// profiles.username is `^[A-Za-z0-9._-]{3,30}$` and unique on lower(username)
// (addenda 010/011), and handle_new_user copies it straight out of the signup
// metadata - so it has to be valid and free before the auth user is created, or
// the trigger aborts the signup with a constraint violation.
function slugify(displayName: string, email: string): string {
  const base = displayName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]/g, "")
    .slice(0, 24);
  if (base.length >= 3) return base;
  // A name that is entirely non-Latin (or two characters long) leaves nothing
  // to slug; the local part of the email is the next best handle.
  const fromEmail = email.split("@")[0].replace(/[^A-Za-z0-9._-]/g, "").slice(0, 24);
  return fromEmail.length >= 3 ? fromEmail : `pro${Date.now().toString().slice(-8)}`;
}

async function freeUsername(
  admin: ReturnType<typeof adminClient>,
  displayName: string,
  email: string
): Promise<string> {
  const base = slugify(displayName, email);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base.slice(0, 25)}${attempt}`;
    const { data } = await admin
      .from("profiles")
      .select("id")
      .ilike("username", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  return `pro${Date.now().toString().slice(-10)}`;
}

function alreadyRegistered(error: { message?: string; code?: string } | null): boolean {
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
 * Creates (or upgrades) a promoter/venue account and emails them a link to set
 * their own password. MadGigz never sees or sets their password - the account
 * is made with a random one that is immediately unreachable, and the recovery
 * link is what actually lets them in.
 */
export async function createProAccount(
  input: CreateProAccountInput
): Promise<CreateProAccountResult> {
  const currentAdmin = await requireAdmin();
  const admin = adminClient();

  const displayName = input.displayName.trim();
  const email = input.email.trim().toLowerCase();

  if (!displayName) return { error: "Name is required" };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address" };
  if (input.type !== "promoter" && input.type !== "venue") return { error: "Pick an account type" };
  // A venue account with no room sees nothing at all, so it's a broken account
  // rather than an empty one. The DB has the same check; this is the readable
  // half of it.
  if (input.type === "venue" && !input.venueId) {
    return { error: "Pick the venue this account manages" };
  }
  const locale: Locale = isLocale(input.locale) ? input.locale : DEFAULT_LOCALE;

  const username = await freeUsername(admin, displayName, email);

  // email_confirm: the address is taken on trust from the admin who typed it,
  // and the set-password link proves it for real a moment later. Without this
  // they'd have to confirm an email they never asked for before they could use
  // the reset link that was in it.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: crypto.randomUUID(),
    user_metadata: { username },
  });

  const existingAccount = !created?.user && alreadyRegistered(createError);
  if (!created?.user && !existingAccount) {
    console.error("createProAccount createUser failed:", createError);
    return { error: "Couldn't create that account. Check the email address and try again." };
  }

  // Doubles as the lookup for an email that already had an account: generateLink
  // returns the user it belongs to, and auth.users isn't reachable through
  // PostgREST to query directly.
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
  });

  const userId = created?.user?.id ?? link?.user?.id;
  if (linkError || !link?.properties?.hashed_token || !userId) {
    console.error("createProAccount generateLink failed:", linkError);
    return { error: "Account made, but the invite link couldn't be created. Try again." };
  }

  // Our own /auth/confirm rather than Stripe-style action_link: it already
  // handles a spent token with copy written for a human, and sends a verified
  // recovery straight to the reset-password screen.
  const setPasswordUrl = `${appUrl()}/auth/confirm?token_hash=${link.properties.hashed_token}&type=recovery`;

  // Upsert, so re-running this for an address that already has a pro account
  // fixes a typo'd name or the wrong type instead of erroring on the primary
  // key. Re-sending the invite is often exactly why an admin is back here.
  // profiles.artist_name is really "public display name" - it is what the public
  // profile page and the "presented by" credit render. Setting it here is what
  // gives a promoter a page with their business on it rather than a slug, and it
  // means every existing public-profile query works for them unchanged.
  await admin.from("profiles").update({ artist_name: displayName }).eq("id", userId);

  const { error: insertError } = await admin.from("pro_accounts").upsert(
    {
      id: userId,
      type: input.type,
      display_name: displayName,
      venue_id: input.type === "venue" ? input.venueId : null,
      locale,
      active: true,
      created_by: currentAdmin.id,
    },
    { onConflict: "id" }
  );

  if (insertError) {
    if (isProNotReady(insertError)) {
      // Either the table (051) or the locale column (054) is missing. Retry
      // without the locale so a half-migrated database can still make accounts
      // rather than refusing outright - they just default to Spanish until 054
      // lands.
      const { error: retryError } = await admin.from("pro_accounts").upsert(
        {
          id: userId,
          type: input.type,
          display_name: displayName,
          venue_id: input.type === "venue" ? input.venueId : null,
          active: true,
          created_by: currentAdmin.id,
        },
        { onConflict: "id" }
      );
      if (retryError) {
        console.error("pro_accounts missing - run addendum_051:", retryError);
        return { error: "The database is missing addendum_051 - run it, then try again" };
      }
    } else {
      console.error("createProAccount upsert failed:", insertError);
      return { error: "The login was made but the pro account wasn't. Check the logs." };
    }
  }

  const { sent } = await sendProInviteEmail({
    to: email,
    displayName,
    type: input.type,
    setPasswordUrl,
    existingAccount,
    locale,
  });

  await logDecision(admin, currentAdmin.id, {
    action: "pro_account_created",
    subjectType: "pro_account",
    subjectId: userId,
    metadata: { type: input.type, displayName, locale, existingAccount, emailSent: sent },
  });

  revalidatePath("/admin/pro");
  return {
    emailSent: sent,
    existingAccount,
    ...(sent ? {} : { setPasswordUrl }),
  };
}

/**
 * Switches a pro account off (or back on). Not a delete: the shows they own,
 * the tickets sold against them and the Stripe account all stay exactly as they
 * are - this only closes the panel door.
 */
export async function setProAccountActive(
  proAccountId: string,
  active: boolean
): Promise<{ error?: string }> {
  const currentAdmin = await requireAdmin();
  const admin = adminClient();

  const { error } = await admin
    .from("pro_accounts")
    .update({ active })
    .eq("id", proAccountId);

  if (error) {
    console.error("setProAccountActive failed:", error);
    return { error: "Couldn't update that account" };
  }

  await logDecision(admin, currentAdmin.id, {
    action: active ? "pro_account_reactivated" : "pro_account_deactivated",
    subjectType: "pro_account",
    subjectId: proAccountId,
  });

  revalidatePath("/admin/pro");
  return {};
}
