import { createAdminClient } from "@/lib/supabase/admin";
import type { FiscalIdentity, FiscalIdType } from "@/lib/fiscal";

// DB layer for fiscal identity (#97). The columns are service-role-only
// (addendum_042 adds them without a grant), so every read/write goes through the
// admin client — the *caller* is authorised by the server action above this, not
// here. Kept out of the "use server" action file so a server component (the
// profile page, the admin payouts page) can call the read directly.

// 42703 = column missing, i.e. addendum_042 hasn't been run yet. Degrade to
// "nothing on file" rather than throwing, per the ship-code-before-SQL rule.
const MISSING_COLUMN = "42703";

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
    if (error.code === MISSING_COLUMN) return null;
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
    if (error.code === MISSING_COLUMN) {
      console.error("storeFiscalIdentity: run addendum_042", error);
      return { error: "missingMigration" };
    }
    console.error("storeFiscalIdentity failed:", error);
    return { error: "saveFailed" };
  }
  return { error: null };
}
