// Fiscal-identity capture (#97). Pure types + validation so the rules are
// testable and shared by the server action and the form. No DB, no Stripe.

export type FiscalIdType = "nif" | "vat" | "other";

export interface FiscalIdentity {
  legalName: string;
  fiscalId: string;
  fiscalIdType: FiscalIdType;
  country: string; // ISO-3166 alpha-2, uppercased
  address: string;
}

export const FISCAL_ID_TYPES: FiscalIdType[] = ["nif", "vat", "other"];

// A NIF/NIE/CIF, VAT number or passport number is only ever letters + digits (a
// VAT id may prefix a country code). Punctuation, spaces and lowercase are noise
// on an invoice, so store a normalised form and compare against that.
export function normalizeFiscalId(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeCountry(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, "");
}

// Deliberately permissive: MadGigz is not the tax authority, and an over-strict
// checksum that rejects a valid EU VAT id would block a real payout. We require
// the pieces an invoice legally needs (a name and an id), a sane id length, and a
// two-letter country — and leave deeper validation to the gestor/Odoo.
export function validateFiscalInput(input: {
  legalName: string;
  fiscalId: string;
  fiscalIdType: string;
  country: string;
  address: string;
}): string | null {
  if (!input.legalName.trim()) return "legalNameRequired";
  const id = normalizeFiscalId(input.fiscalId);
  if (id.length < 5 || id.length > 20) return "fiscalIdInvalid";
  if (!FISCAL_ID_TYPES.includes(input.fiscalIdType as FiscalIdType)) return "fiscalIdTypeInvalid";
  if (normalizeCountry(input.country).length !== 2) return "countryInvalid";
  return null;
}

// The cleaned record ready to store. Callers must have validated first.
export function toFiscalIdentity(input: {
  legalName: string;
  fiscalId: string;
  fiscalIdType: FiscalIdType;
  country: string;
  address: string;
}): FiscalIdentity {
  return {
    legalName: input.legalName.trim(),
    fiscalId: normalizeFiscalId(input.fiscalId),
    fiscalIdType: input.fiscalIdType,
    country: normalizeCountry(input.country),
    address: input.address.trim(),
  };
}
