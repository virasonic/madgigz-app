"use server";

import { sendLegalSubmission } from "@/lib/email";
import { verifyTurnstileToken } from "@/app/(onboarding)/signup/turnstile-actions";
import { CONTENT_REPORT_REASONS, type LegalFormResult } from "@/lib/legal-forms";

// The two public channels the legal texts point to: /complaints (consumer
// complaints, which replaced the EU ODR platform link) and /report-content (the
// DSA art. 16 notice-and-action mechanism). Both are open to anyone, signed in
// or not - a notice from someone without an account must still reach us - so
// Turnstile stands in for the session as the spam gate.
//
// Each submission is emailed to the legal inbox and nothing else; there is no
// table behind these forms. The result is a code the client maps to i18n.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function field(form: FormData, name: string, max: number): string {
  return String(form.get(name) ?? "").trim().slice(0, max);
}

// Required when the widget is configured, exactly as signup does it: with no
// site key (local dev) there is no widget to solve, so there is no token.
async function passesTurnstile(form: FormData): Promise<boolean> {
  if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) return true;
  const { success } = await verifyTurnstileToken(field(form, "turnstileToken", 4096));
  return success;
}

export async function submitComplaint(form: FormData): Promise<LegalFormResult> {
  const email = field(form, "email", 254);
  const name = field(form, "name", 200);
  const reference = field(form, "reference", 300);
  const message = field(form, "message", 5000);
  if (!EMAIL_RE.test(email) || message.length < 10) return { ok: false, error: "invalid" };
  if (!(await passesTurnstile(form))) return { ok: false, error: "captcha" };

  const { sent } = await sendLegalSubmission({
    kind: "complaint",
    replyTo: email,
    subject: `Reclamación MadGigz: ${message.slice(0, 60)}`,
    lines: [
      `Email: ${email}`,
      `Name: ${name || "(not given)"}`,
      `Event / ticket / order: ${reference || "(not given)"}`,
      "",
      message,
    ],
  });
  return sent ? { ok: true } : { ok: false, error: "notSent" };
}

export async function submitContentReport(form: FormData): Promise<LegalFormResult> {
  const email = field(form, "email", 254);
  const name = field(form, "name", 200);
  const content = field(form, "content", 1000);
  const reason = field(form, "reason", 40);
  const explanation = field(form, "explanation", 5000);
  const goodFaith = form.get("goodFaith") === "on";
  if (
    !EMAIL_RE.test(email) ||
    content.length === 0 ||
    !(CONTENT_REPORT_REASONS as readonly string[]).includes(reason) ||
    explanation.length < 10 ||
    !goodFaith
  ) {
    return { ok: false, error: "invalid" };
  }
  if (!(await passesTurnstile(form))) return { ok: false, error: "captcha" };

  const { sent } = await sendLegalSubmission({
    kind: "content-report",
    replyTo: email,
    subject: `DSA notice (${reason}): ${content.slice(0, 60)}`,
    lines: [
      `Content (URL or ID): ${content}`,
      `Reason: ${reason}`,
      `Reporter email: ${email}`,
      `Reporter name: ${name || "(not given)"}`,
      "Good-faith statement: confirmed",
      "",
      "Why it is illegal:",
      explanation,
      "",
      "DSA art. 16: acknowledge receipt and notify the reporter of the decision.",
    ],
  });
  return sent ? { ok: true } : { ok: false, error: "notSent" };
}
