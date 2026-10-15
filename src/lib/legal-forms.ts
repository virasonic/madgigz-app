// Shared by the /report-content form and its server action. Kept out of
// legal-contact-actions.ts because a "use server" module may only export
// async functions.
export const CONTENT_REPORT_REASONS = [
  "intellectualProperty",
  "hate",
  "violence",
  "privacy",
  "fraud",
  "minors",
  "other",
] as const;

export type LegalFormResult =
  | { ok: true }
  | { ok: false; error: "invalid" | "captcha" | "notSent" };
