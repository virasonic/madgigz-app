// Fiscal-identity capture (#97). Pure types + validation so the rules are
// testable and shared by the server action and the form. No DB, no Stripe.

export type FiscalIdType = "nif" | "dni" | "vat" | "other";

export interface FiscalIdentity {
  legalName: string;
  fiscalId: string;
  fiscalIdType: FiscalIdType;
  country: string; // ISO-3166 alpha-2, uppercased
  address: string;
}

// Ordered by how a Spanish organiser thinks about themselves: a company gives a
// NIF/CIF, an individual gives a DNI (or NIE, if they're a foreign resident).
//
// Strictly, a natural person's NIF *is* their DNI number plus its letter, so
// these two overlap in law - but "NIF" reads as a business thing to someone who
// has only ever been handed a DNI, and an organiser who can't find their own ID
// in the list is an organiser who doesn't get paid. What the gestor and Odoo
// need is the number; the label is there so the right person types it.
export const FISCAL_ID_TYPES: FiscalIdType[] = ["nif", "dni", "vat", "other"];

// A NIF/DNI/NIE/CIF, VAT number or passport number is only ever letters + digits (a
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
