import { createAdminClient } from "@/lib/supabase/admin";
import type { FiscalIdentity, FiscalIdType } from "@/lib/fiscal";

// DB layer for fiscal identity (#97). The columns are service-role-only
// (addendum_042 adds them without a grant), so every read/write goes through the
// admin client — the *caller* is authorised by the server action above this, not
// here. Kept out of the "use server" action file so a server component (the
// profile page, the admin payouts page) can call the read directly.

// The column may be absent (addendum_042 not run) or present-but-not-yet-in
// PostgREST's schema cache (just run, cache still warming). PostgREST reports
// these differently depending on read vs write:
//   42703    — Postgres "column does not exist" (surfaces on SELECT)
//   PGRST204 — "column not found in the schema cache" (surfaces on write)
//   PGRST205 — table/relation not found in the schema cache
// All three mean "not ready yet", so degrade to "nothing on file" / a clear
// try-again rather than a generic failure. Per the ship-code-before-SQL rule.
const NOT_READY_CODES = new Set(["42703", "PGRST204", "PGRST205"]);

function isNotReady(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code && NOT_READY_CODES.has(error.code)) return true;
  // Some PostgREST versions omit the code and only set the message.
  return /schema cache|does not exist/i.test(error.message ?? "");
}

const COLUMNS =
  "fiscal_legal_name, fiscal_id, fiscal_id_type, fiscal_country, fiscal_address, fiscal_provided_at";

export interface StoredFiscalIdentity extends FiscalIdentity {
  providedAt: string | null;
}

export async function getFiscalIdentity(userId: string): Promise<StoredFiscalIdentity | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select(COLUMNS)
    .eq("id", userId)
    .single();

  if (error) {
    if (isNotReady(error)) return null;
    console.error("getFiscalIdentity failed:", error);
    return null;
  }
  const row = data as {
    fiscal_legal_name: string | null;
    fiscal_id: string | null;
    fiscal_id_type: string | null;
    fiscal_country: string | null;
    fiscal_address: string | null;
    fiscal_provided_at: string | null;
  };
  if (!row.fiscal_id) return null;

  return {
    legalName: row.fiscal_legal_name ?? "",
    fiscalId: row.fiscal_id,
    fiscalIdType: (row.fiscal_id_type as FiscalIdType) ?? "other",
    country: row.fiscal_country ?? "",
    address: row.fiscal_address ?? "",
    providedAt: row.fiscal_provided_at,
  };
}

// Whether an organiser has fiscal info on file — cheap boolean for gating/props
// without shipping the sensitive values to the client.
export async function hasFiscalIdentity(userId: string): Promise<boolean> {
  return (await getFiscalIdentity(userId)) !== null;
}

export async function storeFiscalIdentity(
  userId: string,
  identity: FiscalIdentity
): Promise<{ error: string | null }> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({
      fiscal_legal_name: identity.legalName,
      fiscal_id: identity.fiscalId,
      fiscal_id_type: identity.fiscalIdType,
      fiscal_country: identity.country,
      fiscal_address: identity.address,
      fiscal_provided_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    if (isNotReady(error)) {
      console.error("storeFiscalIdentity: addendum_042 not ready (run it / reload schema)", error);
      return { error: "missingMigration" };
    }
    console.error("storeFiscalIdentity failed:", error);
    return { error: "saveFailed" };
  }
  return { error: null };
}
