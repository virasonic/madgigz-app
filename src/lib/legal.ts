// The legal documents live on the AuraSonic marketing site (Odoo), not in the
// app - the app links out to them. Spanish versions sit under /es on the same
// host, so the URL is locale-dependent but the paths are shared.
import type { Locale } from "@/lib/i18n/config";

export const LEGAL_DOCS = {
  terms: { path: "/terms-of-service", labelKey: "legal.termsOfService" },
  organiserTerms: { path: "/organiser-terms", labelKey: "legal.organiserTerms" },
  privacy: { path: "/privacy", labelKey: "legal.privacyPolicy" },
  legalNotice: { path: "/legal-notice", labelKey: "legal.legalNotice" },
  cookiePolicy: { path: "/cookie-policy", labelKey: "legal.cookiePolicy" },
} as const;

export type LegalDocKey = keyof typeof LEGAL_DOCS;

const LEGAL_BASE = "https://www.aurasonic.es";

export function legalUrl(locale: Locale, doc: LegalDocKey): string {
  return `${LEGAL_BASE}${locale === "es" ? "/es" : ""}${LEGAL_DOCS[doc].path}`;
}
