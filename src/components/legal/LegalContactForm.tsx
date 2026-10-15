"use client";

import { useRef, useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Turnstile, { TurnstileHandle } from "@/components/ui/Turnstile";
import { useT } from "@/lib/i18n/LocaleProvider";
import { submitComplaint, submitContentReport } from "@/lib/legal-contact-actions";
import { CONTENT_REPORT_REASONS } from "@/lib/legal-forms";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const LEGAL_EMAIL = "info@aurasonic.es";

const TEXTAREA =
  "w-full rounded-2xl border border-muted/20 bg-surface px-4 py-3.5 text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary";
const LABEL = "font-heading text-sm text-muted";

// The public complaints form and the DSA illegal-content notice form. One
// component because they share everything but their middle fields: email,
// optional name, the Turnstile gate and the sent/error states.
export default function LegalContactForm({ kind }: { kind: "complaint" | "content-report" }) {
  const { t } = useT();
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (TURNSTILE_SITE_KEY && !token) {
      setError(t("legalForms.errorCaptcha"));
      return;
    }
    setSubmitting(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    if (token) form.set("turnstileToken", token);
    const result =
      kind === "complaint" ? await submitComplaint(form) : await submitContentReport(form);
    setSubmitting(false);
    if (result.ok) {
      setSent(true);
      return;
    }
    // A token is single-use: any failed attempt needs a fresh one to retry.
    turnstileRef.current?.reset();
    setToken(null);
    setError(
      result.error === "invalid"
        ? t("legalForms.errorInvalid")
        : result.error === "captcha"
          ? t("legalForms.errorCaptcha")
          : t("legalForms.errorNotSent", { email: LEGAL_EMAIL })
    );
  }

  if (sent) {
    return (
      <div className="mt-8 rounded-2xl border border-muted/20 bg-surface p-5">
        <p className="font-heading text-lg text-foreground">{t("legalForms.sentTitle")}</p>
        <p className="mt-1 text-sm text-foreground/85">
          {t(kind === "complaint" ? "legalForms.sentComplaint" : "legalForms.sentReport")}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
      {kind === "content-report" ? (
        <>
          <Input name="content" label={t("legalForms.contentLabel")} required maxLength={1000} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="reason" className={LABEL}>
              {t("legalForms.reasonLabel")}
            </label>
            <select id="reason" name="reason" required defaultValue="" className={TEXTAREA}>
              <option value="" disabled>
                {t("legalForms.reasonPick")}
              </option>
              {CONTENT_REPORT_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {t(`legalForms.reasons.${reason}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="explanation" className={LABEL}>
              {t("legalForms.explanationLabel")}
            </label>
            <textarea id="explanation" name="explanation" required minLength={10} maxLength={5000} rows={5} className={TEXTAREA} />
          </div>
        </>
      ) : (
        <>
          <Input name="reference" label={t("legalForms.referenceLabel")} maxLength={300} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor="message" className={LABEL}>
              {t("legalForms.messageLabel")}
            </label>
            <textarea
              id="message"
              name="message"
              required
              minLength={10}
              maxLength={5000}
              rows={6}
              placeholder={t("legalForms.messagePlaceholder")}
              className={TEXTAREA}
            />
          </div>
        </>
      )}

      <Input name="email" type="email" label={t("legalForms.emailLabel")} required maxLength={254} autoComplete="email" />
      <Input name="name" label={t("legalForms.nameLabel")} maxLength={200} autoComplete="name" />

      {kind === "content-report" && (
        <label className="flex items-start gap-3 text-sm text-foreground/85">
          <input type="checkbox" name="goodFaith" required className="mt-1 accent-primary" />
          <span>{t("legalForms.goodFaith")}</span>
        </label>
      )}

      {TURNSTILE_SITE_KEY && (
        <Turnstile
          ref={turnstileRef}
          siteKey={TURNSTILE_SITE_KEY}
          onVerify={setToken}
          onExpire={() => setToken(null)}
        />
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button type="submit" disabled={submitting}>
        {submitting ? t("legalForms.sending") : t("legalForms.send")}
      </Button>
    </form>
  );
}
