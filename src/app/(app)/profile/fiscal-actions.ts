"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isArtistRole } from "@/lib/roles";
import { fetchProAccount } from "@/lib/pro";
import { toFiscalIdentity, validateFiscalInput, type FiscalIdType } from "@/lib/fiscal";
import {
  getFiscalIdentity,
  storeFiscalIdentity,
  type StoredFiscalIdentity,
} from "@/lib/fiscal-server";

// Server Actions are public POST endpoints, so the caller is re-derived from the
// session — never trusted from an argument. Only an ORGANISER has a fiscal
// identity to give: someone who can be paid, and whom MadGigz therefore has to
// invoice and hold tax details for.
//
// Promoters and venues are organisers too (#88), and they hit the requirement
// harder than artists do — /admin/payouts refuses to release without tax details
// on file, so a promoter with no way to enter theirs could sell a show and then
// not be payable. That was the gap: this gate used to be artist-only.
async function requireOrganiser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const admin = createAdminClient();
  const [{ data: profile }, pro] = await Promise.all([
    admin.from("profiles").select("role, artist_status").eq("id", user.id).single(),
    fetchProAccount(admin, user.id),
  ]);

  if (!profile || (!isArtistRole(profile.role) && !pro?.active)) {
    throw new Error("Not an organiser");
  }
  return user;
}

export interface FiscalFormInput {
  legalName: string;
  fiscalId: string;
  fiscalIdType: string;
  country: string;
  address: string;
}

// Error strings returned as i18n KEYS (client maps them through the catalog), so
// no user-facing English leaks from the server. Reuses the fiscal.* namespace.
export async function saveMyFiscalIdentity(
  input: FiscalFormInput
): Promise<{ error: string | null }> {
  let user;
  try {
    user = await requireOrganiser();
  } catch {
    return { error: "fiscal.errorNotArtist" };
  }

  const invalid = validateFiscalInput(input);
  if (invalid) return { error: `fiscal.error.${invalid}` };

  const identity = toFiscalIdentity({
    legalName: input.legalName,
    fiscalId: input.fiscalId,
    fiscalIdType: input.fiscalIdType as FiscalIdType,
    country: input.country,
    address: input.address,
  });

  const { error } = await storeFiscalIdentity(user.id, identity);
  if (error) return { error: error === "missingMigration" ? "fiscal.errorMigration" : "fiscal.errorSave" };

  revalidatePath("/profile");
  revalidatePath("/pro/payouts");
  return { error: null };
}

// Prefill the form with what's on file. Values are sensitive, so this runs only
// for the signed-in owner and returns nothing to anyone else.
export async function loadMyFiscalIdentity(): Promise<StoredFiscalIdentity | null> {
  let user;
  try {
    user = await requireOrganiser();
  } catch {
    return null;
  }
  return getFiscalIdentity(user.id);
}
