"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isArtistRole } from "@/lib/roles";
import { toFiscalIdentity, validateFiscalInput, type FiscalIdType } from "@/lib/fiscal";
import {
  getFiscalIdentity,
  storeFiscalIdentity,
  type StoredFiscalIdentity,
} from "@/lib/fiscal-server";

// Server Actions are public POST endpoints, so the caller is re-derived from the
// session — never trusted from an argument. Only an approved artist (an
// organiser who can receive payouts) has a fiscal identity to give.
async function requireArtist() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: profile } = await createAdminClient()
    .from("profiles")
    .select("role, artist_status")
    .eq("id", user.id)
    .single();

  if (!profile || !isArtistRole(profile.role)) throw new Error("Not an artist");
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
    user = await requireArtist();
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
  return { error: null };
}

// Prefill the form with what's on file. Values are sensitive, so this runs only
// for the signed-in owner and returns nothing to anyone else.
export async function loadMyFiscalIdentity(): Promise<StoredFiscalIdentity | null> {
  let user;
  try {
    user = await requireArtist();
  } catch {
    return null;
  }
  return getFiscalIdentity(user.id);
}
